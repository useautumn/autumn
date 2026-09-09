import {
	type BillingResult,
	CusProductStatus,
	cp,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isOneOffProduct,
	MetadataType,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type PendingInvoiceCandidate = {
	customerProduct: FullCusProduct;
	metadataId: string;
	stripeInvoice: Stripe.Invoice;
};

const isPayable = (candidate: PendingInvoiceCandidate) =>
	candidate.stripeInvoice.status === "open" &&
	Boolean(candidate.stripeInvoice.hosted_invoice_url);

const byEarliestCreated = (
	a: PendingInvoiceCandidate,
	b: PendingInvoiceCandidate,
) =>
	(a.customerProduct.created_at ?? 0) - (b.customerProduct.created_at ?? 0) ||
	a.stripeInvoice.id.localeCompare(b.stripeInvoice.id);

const unpayableInvoiceMessage = ({
	customerProduct,
	stripeInvoice,
}: PendingInvoiceCandidate) => {
	const reason =
		stripeInvoice.status === "open"
			? "invoice has no payment page"
			: `invoice is ${stripeInvoice.status}`;
	return `The pending plan '${customerProduct.product.name}' cannot be paid (${reason}). Cancel or review the pending plan before attaching another plan.`;
};

/** Uncapped: fullCustomer.customer_products is limited and orders pending rows last. */
export const listPendingCustomerProducts = ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) =>
	CusProductService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		inStatuses: [CusProductStatus.Pending],
	});

/** Invoice-backed pending main plans in the same entity/group, each with a fresh
 * Stripe invoice (checkout-backed rows stay with checkCheckoutSessionLock). */
const listPendingInvoiceCandidates = async ({
	ctx,
	fullCustomer,
	attachProduct,
	pendingCustomerProducts,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
	pendingCustomerProducts: FullCusProduct[];
}): Promise<PendingInvoiceCandidate[]> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const candidates: PendingInvoiceCandidate[] = [];
	const seenInvoiceIds = new Set<string>();

	for (const customerProduct of pendingCustomerProducts) {
		if (!customerProduct.metadata_id) continue;

		const inScope = cp(customerProduct)
			.main()
			.recurring()
			.hasProductGroup({ productGroup: attachProduct.group })
			.onEntity({ internalEntityId: fullCustomer.entity?.internal_id }).valid;
		if (!inScope) continue;

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id,
		});
		const invoiceBacked =
			metadata?.type === MetadataType.DeferredInvoice &&
			Boolean(metadata.stripe_invoice_id) &&
			!metadata.stripe_checkout_session_id;
		if (!invoiceBacked || !metadata?.stripe_invoice_id) continue;
		if (seenInvoiceIds.has(metadata.stripe_invoice_id)) continue;
		seenInvoiceIds.add(metadata.stripe_invoice_id);

		const stripeInvoice = await stripeCli.invoices.retrieve(
			metadata.stripe_invoice_id,
		);
		candidates.push({
			customerProduct,
			metadataId: metadata.id,
			stripeInvoice,
		});
	}

	return candidates.sort(byEarliestCreated);
};

/** Resumes the earliest open pending invoice for this transition instead of minting
 * another; a paid one blocks until promoted, and no payable one throws 409. */
export const findPendingInvoiceConflict = async ({
	ctx,
	fullCustomer,
	attachProduct,
	loadPendingCustomerProducts,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
	loadPendingCustomerProducts: () => Promise<FullCusProduct[]>;
}): Promise<BillingResult | undefined> => {
	if (attachProduct.is_add_on || isOneOffProduct({ product: attachProduct }))
		return;

	const candidates = await listPendingInvoiceCandidates({
		ctx,
		fullCustomer,
		attachProduct,
		pendingCustomerProducts: await loadPendingCustomerProducts(),
	});
	if (candidates.length === 0) return;

	const paid = candidates.find(
		(candidate) => candidate.stripeInvoice.status === "paid",
	);
	if (paid) {
		throw new RecaseError({
			code: ErrCode.PendingPlanConflict,
			message: `A payment for the pending plan '${paid.customerProduct.product.name}' is still processing. Retry once it has been applied.`,
			statusCode: StatusCodes.CONFLICT,
		});
	}

	const payable = candidates.find(isPayable);
	if (!payable) {
		throw new RecaseError({
			code: ErrCode.PendingPlanConflict,
			message: unpayableInvoiceMessage(candidates[0]),
			statusCode: StatusCodes.CONFLICT,
		});
	}

	return {
		stripe: {
			deferred: true,
			deferredMetadataId: payable.metadataId,
			stripeInvoice: payable.stripeInvoice,
			resumedPendingInvoice: true,
		},
	};
};
