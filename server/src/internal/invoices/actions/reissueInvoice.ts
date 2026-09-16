import {
	cusProductToProduct,
	ErrCode,
	type FullCustomer,
	type InvoiceTemplate,
	MetadataType,
	ProcessorType,
	RecaseError,
	secondsToMs,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { checkoutRepo } from "@/internal/checkouts";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { workflows } from "@/queue/workflows";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";
import { voidInvoice } from "./voidInvoice";

const SECONDS_PER_DAY = 24 * 60 * 60;

type ReissueInvoiceResult = {
	replacement: InvoiceListRow;
	voidedInvoiceId: string;
};

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

const loadOpenStripeInvoice = async ({
	ctx,
	row,
}: {
	ctx: AutumnContext;
	row: InvoiceListRow;
}) => {
	const processorType = row.invoice.processor_type ?? ProcessorType.Stripe;
	if (processorType !== ProcessorType.Stripe || !row.invoice.stripe_id) {
		throw invalidRequest("Only Stripe invoices can be reissued");
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: row.invoice.stripe_id,
		expand: [],
	});

	if (stripeInvoice.status === "void") {
		const replacementId = stripeInvoice.metadata?.autumn_reissued_to;
		throw invalidRequest(
			replacementId
				? `Invoice ${row.invoice.id} was already reissued as Stripe invoice ${replacementId}`
				: `Invoice ${row.invoice.id} is void and cannot be reissued`,
		);
	}
	if (stripeInvoice.status !== "open") {
		throw invalidRequest(
			`Invoice ${row.invoice.id} is ${stripeInvoice.status}; only open invoices can be reissued`,
		);
	}
	if (stripeInvoice.collection_method !== "send_invoice") {
		throw invalidRequest(
			`Invoice ${row.invoice.id} is charged automatically; only send-invoice invoices can be reissued`,
		);
	}

	return { stripeCli, stripeInvoice };
};

/** Keeps the original deadline unless it has passed, in which case new terms are required. */
const resolveDaysUntilDue = ({
	stripeInvoice,
	netTermsDays,
	nowMs,
}: {
	stripeInvoice: Stripe.Invoice;
	netTermsDays?: number;
	nowMs: number;
}): number => {
	if (netTermsDays) return netTermsDays;

	const dueDateMs = stripeInvoice.due_date
		? secondsToMs(stripeInvoice.due_date)
		: undefined;
	const remainingDays = dueDateMs
		? Math.ceil((dueDateMs - nowMs) / (SECONDS_PER_DAY * 1000))
		: 0;

	if (remainingDays < 1) {
		throw invalidRequest(
			"The original invoice is already past due; pass net_terms_days to give the replacement a new due date",
		);
	}
	return remainingDays;
};

const stripeLinesToAddLineParams = ({
	lines,
}: {
	lines: Stripe.InvoiceLineItem[];
}): Stripe.InvoiceAddLinesParams.Line[] =>
	lines.map((line) => ({
		description: line.description ?? undefined,
		// Discounts were already applied on the original, so copy net amounts.
		amount:
			line.amount -
			(line.discount_amounts ?? []).reduce(
				(total, discount) => total + discount.amount,
				0,
			),
		discountable: false,
		period: line.period
			? { start: line.period.start, end: line.period.end }
			: undefined,
		metadata: { ...(line.metadata ?? {}), autumn_reissued_from_line: line.id },
	}));

const createReplacementDraft = async ({
	stripeCli,
	stripeInvoice,
	template,
	daysUntilDue,
	paymentMethodTypes,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	daysUntilDue: number;
	paymentMethodTypes?: string[];
}) => {
	const stripeSubId = stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	const stripeCusId =
		typeof stripeInvoice.customer === "string"
			? stripeInvoice.customer
			: stripeInvoice.customer?.id;
	if (!stripeCusId) {
		throw invalidRequest("Original invoice has no Stripe customer");
	}

	const draft = await createStripeInvoice({
		stripeCli,
		stripeCusId,
		stripeSubId,
		currency: stripeSubId ? undefined : stripeInvoice.currency,
		collectionMethod: "send_invoice",
		daysUntilDue,
		footer: template?.footer ?? stripeInvoice.footer ?? undefined,
		description: template?.memo ?? stripeInvoice.description ?? undefined,
		paymentMethodTypes: paymentMethodTypes as never,
		metadata: {
			...(stripeInvoice.metadata ?? {}),
			autumn_reissued_from: stripeInvoice.id,
			autumn_source_billing_reason: stripeInvoice.billing_reason ?? "",
		},
		defaultTaxRates: stripeInvoice.default_tax_rates?.map((rate) =>
			typeof rate === "string" ? rate : rate.id,
		),
	});

	const lines = await stripeCli.invoices.listLineItems(stripeInvoice.id, {
		limit: 100,
	});

	return addStripeInvoiceLines({
		stripeCli,
		invoiceId: draft.id,
		lines: stripeLinesToAddLineParams({ lines: lines.data }),
	});
};

/** Moves the deferred plan's pointers so paying the replacement fulfils it. */
const repointDeferredReferences = async ({
	ctx,
	fromStripeInvoiceId,
	toStripeInvoiceId,
}: {
	ctx: AutumnContext;
	fromStripeInvoiceId: string;
	toStripeInvoiceId: string;
}) => {
	const metadata = await MetadataService.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: fromStripeInvoiceId,
		type: MetadataType.DeferredInvoice,
	});
	if (metadata) {
		const swapped = await MetadataService.swapStripeInvoiceId({
			db: ctx.db,
			id: metadata.id,
			fromStripeInvoiceId,
			toStripeInvoiceId,
		});
		if (!swapped) {
			throw new RecaseError({
				message: "Invoice is already being reissued or paid; try again",
				code: ErrCode.LockAlreadyExists,
				statusCode: 409,
			});
		}
	}

	const checkout = await checkoutRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: fromStripeInvoiceId,
	});
	if (checkout) {
		await checkoutRepo.update({
			db: ctx.db,
			id: checkout.id,
			updates: { stripe_invoice_id: toStripeInvoiceId },
		});
	}
};

const storeReplacementInAutumn = async ({
	ctx,
	fullCustomer,
	replacement,
	original,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	replacement: Stripe.Invoice;
	original: InvoiceListRow;
}) => {
	const fullProducts = fullCustomer.customer_products
		.filter((customerProduct) =>
			original.invoice.internal_product_ids?.includes(
				customerProduct.internal_product_id,
			),
		)
		.map((customerProduct) =>
			cusProductToProduct({ cusProduct: customerProduct }),
		);

	const autumnInvoice = await upsertInvoiceFromStripe({
		ctx,
		stripeInvoice: replacement,
		fullCustomer,
		fullProducts,
		internalEntityId: original.invoice.internal_entity_id ?? undefined,
	});

	if (autumnInvoice) {
		await workflows.triggerStoreInvoiceLineItems({
			orgId: ctx.org.id,
			env: ctx.env,
			stripeInvoiceId: replacement.id,
			autumnInvoiceId: autumnInvoice.id,
			billingLineItems: [],
		});
	}

	return autumnInvoice;
};

/**
 * Voids an open send-invoice invoice and replaces it with a copy carrying the
 * template's footer/memo. The replacement stays linked to the same subscription
 * and inherits the original's deferred-plan pointers, so paying it has the same
 * effect the original payment would have had.
 */
export const reissueInvoice = async ({
	ctx,
	invoiceId,
	invoiceTemplateId,
	netTermsDays,
}: {
	ctx: AutumnContext;
	invoiceId: string;
	invoiceTemplateId?: string;
	netTermsDays?: number;
}): Promise<ReissueInvoiceResult> => {
	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) throw invalidRequest(`Invoice ${invoiceId} not found`);

	const { stripeCli, stripeInvoice } = await loadOpenStripeInvoice({
		ctx,
		row,
	});

	const template = invoiceTemplateId
		? await InvoiceTemplateService.getById({
				db: ctx.db,
				orgId: ctx.org.id,
				id: invoiceTemplateId,
			})
		: undefined;
	if (invoiceTemplateId && !template) {
		throw invalidRequest(`Invoice template ${invoiceTemplateId} not found`);
	}

	const daysUntilDue = resolveDaysUntilDue({
		stripeInvoice,
		netTermsDays,
		nowMs: Date.now(),
	});

	const draft = await createReplacementDraft({
		stripeCli,
		stripeInvoice,
		template,
		daysUntilDue,
		paymentMethodTypes: ctx.org.config.allowed_payment_methods ?? undefined,
	});

	try {
		await repointDeferredReferences({
			ctx,
			fromStripeInvoiceId: stripeInvoice.id,
			toStripeInvoiceId: draft.id,
		});
		await voidInvoice({ ctx, invoiceId });
	} catch (error) {
		await stripeCli.invoices.del(draft.id).catch(() => undefined);
		await MetadataService.getByStripeInvoiceId({
			db: ctx.db,
			stripeInvoiceId: draft.id,
		}).then((metadata) =>
			metadata
				? MetadataService.swapStripeInvoiceId({
						db: ctx.db,
						id: metadata.id,
						fromStripeInvoiceId: draft.id,
						toStripeInvoiceId: stripeInvoice.id,
					})
				: undefined,
		);
		throw error;
	}

	// Automatic collection is what makes Stripe treat the replacement as the
	// subscription's receivable (overdue → past_due, paid → active).
	const finalized = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: draft.id,
		autoAdvance: true,
	});

	await stripeCli.invoices.update(stripeInvoice.id, {
		metadata: { autumn_reissued_to: finalized.id },
	});

	const customerId = row.customer_id ?? row.invoice.internal_customer_id;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const autumnInvoice = await storeReplacementInAutumn({
		ctx,
		fullCustomer,
		replacement: finalized,
		original: row,
	});
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "reissueInvoice",
	});

	const replacement = autumnInvoice
		? await InvoiceService.getListRowById({ ctx, id: autumnInvoice.id })
		: null;
	if (!replacement) {
		throw new RecaseError({
			message: `Reissued invoice ${finalized.id} could not be stored`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	await updateInvoiceFromStripe({ ctx, customerId, stripeInvoice: finalized });

	return { replacement, voidedInvoiceId: invoiceId };
};
