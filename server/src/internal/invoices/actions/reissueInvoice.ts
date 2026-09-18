import { generateKsuid } from "@autumn/ksuid";
import {
	cusProductToProduct,
	type DbInvoiceLineItem,
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
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
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
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { invoiceLineItemRepo } from "../lineItems/repos";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";
import { voidInvoice } from "./voidInvoice";

const ADD_LINES_BATCH_SIZE = 100;

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
const resolveDueDate = ({
	stripeInvoice,
	netTermsDays,
	nowMs,
}: {
	stripeInvoice: Stripe.Invoice;
	netTermsDays?: number;
	nowMs: number;
}): { dueDate?: number; daysUntilDue?: number } => {
	if (netTermsDays) return { daysUntilDue: netTermsDays };

	const dueDateMs = stripeInvoice.due_date
		? secondsToMs(stripeInvoice.due_date)
		: 0;
	if (dueDateMs <= nowMs) {
		throw invalidRequest(
			"The original invoice is already past due; pass net_terms_days to give the replacement a new due date",
		);
	}
	return { dueDate: stripeInvoice.due_date ?? undefined };
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
		tax_rates: line.taxes?.length
			? line.taxes.flatMap((tax) =>
					tax.tax_rate_details?.tax_rate ? [tax.tax_rate_details.tax_rate] : [],
				)
			: undefined,
		metadata: { ...(line.metadata ?? {}), autumn_reissued_from_line: line.id },
	}));

const createReplacementDraft = async ({
	stripeCli,
	stripeInvoice,
	template,
	dueDate,
	daysUntilDue,
	paymentMethodTypes,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	dueDate?: number;
	daysUntilDue?: number;
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
		dueDate,
		daysUntilDue,
		footer: template?.footer ?? stripeInvoice.footer ?? undefined,
		description: template?.memo ?? stripeInvoice.description ?? undefined,
		paymentMethodTypes: paymentMethodTypes as never,
		metadata: {
			...(stripeInvoice.metadata ?? {}),
			autumn_reissued_from: stripeInvoice.id,
			autumn_source_billing_reason: stripeInvoice.billing_reason ?? "",
		},
		automaticTax: stripeInvoice.automatic_tax?.enabled ?? false,
		defaultTaxRates: stripeInvoice.default_tax_rates?.map((rate) =>
			typeof rate === "string" ? rate : rate.id,
		),
	});

	const lines = stripeLinesToAddLineParams({
		lines: await getStripeInvoiceLineItems({
			stripeClient: stripeCli,
			invoiceId: stripeInvoice.id,
		}),
	});

	let withLines = draft;
	for (let start = 0; start < lines.length; start += ADD_LINES_BATCH_SIZE) {
		withLines = await addStripeInvoiceLines({
			stripeCli,
			invoiceId: draft.id,
			lines: lines.slice(start, start + ADD_LINES_BATCH_SIZE),
		});
	}
	return withLines;
};

const updateStripeCustomerEmail = async ({
	stripeCli,
	stripeInvoice,
	email,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	email: string;
}) => {
	const stripeCusId =
		typeof stripeInvoice.customer === "string"
			? stripeInvoice.customer
			: stripeInvoice.customer?.id;
	if (!stripeCusId) {
		throw invalidRequest("Original invoice has no Stripe customer");
	}
	await stripeCli.customers.update(stripeCusId, { email });
};

/** Creates, finalizes and swaps in the replacement, then voids the original. */
const issueReplacement = async ({
	ctx,
	stripeCli,
	invoiceId,
	stripeInvoice,
	template,
	dueDate,
	daysUntilDue,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	invoiceId: string;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	dueDate?: number;
	daysUntilDue?: number;
}): Promise<Stripe.Invoice> => {
	const draft = await createReplacementDraft({
		stripeCli,
		stripeInvoice,
		template,
		dueDate,
		daysUntilDue,
		paymentMethodTypes: ctx.org.config.allowed_payment_methods ?? undefined,
	});

	if (draft.total !== stripeInvoice.total) {
		await stripeCli.invoices.del(draft.id).catch(() => undefined);
		throw new RecaseError({
			message: `Replacement total (${draft.total}) does not match the original (${stripeInvoice.total}); the invoice was not reissued`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	// Automatic collection is what makes Stripe treat the replacement as the
	// subscription's receivable (overdue → past_due, paid → active).
	const finalized = await finalizeStripeInvoice({
		stripeCli,
		invoiceId: draft.id,
		autoAdvance: true,
	});

	try {
		await repointDeferredReferences({
			ctx,
			fromStripeInvoiceId: stripeInvoice.id,
			toStripeInvoiceId: finalized.id,
		});
		await voidInvoice({ ctx, invoiceId });
	} catch (error) {
		// The original stays payable; retire the replacement instead.
		await repointDeferredReferences({
			ctx,
			fromStripeInvoiceId: finalized.id,
			toStripeInvoiceId: stripeInvoice.id,
		}).catch(() => undefined);
		try {
			await stripeCli.invoices.voidInvoice(finalized.id);
		} catch {
			throw new RecaseError({
				message: `Invoice ${invoiceId} could not be voided while being reissued; its replacement ${finalized.id} is still open and must be voided manually`,
				code: ErrCode.InternalError,
				statusCode: 409,
			});
		}
		throw error;
	}

	return finalized;
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

/** Carries the original's Autumn associations (products, entitlements, periods) onto the copied lines. */
const copyLineItemRows = async ({
	ctx,
	original,
	replacement,
	autumnInvoiceId,
}: {
	ctx: AutumnContext;
	original: InvoiceListRow;
	replacement: Stripe.Invoice;
	autumnInvoiceId: string;
}) => {
	const originalRows = await invoiceLineItemRepo.getByInvoiceIds({
		db: ctx.db,
		invoiceIds: [original.invoice.id],
	});
	if (originalRows.length === 0) return;

	const replacementLines = await getStripeInvoiceLineItems({
		stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
		invoiceId: replacement.id,
	});
	const replacementLineBySource = new Map(
		replacementLines.map((line) => [
			line.metadata?.autumn_reissued_from_line,
			line,
		]),
	);

	const copied: DbInvoiceLineItem[] = originalRows.flatMap((row) => {
		const line = row.stripe_id
			? replacementLineBySource.get(row.stripe_id)
			: undefined;
		if (!line) return [];
		return [
			{
				...row,
				id: generateKsuid({ prefix: "invoice_li_" }),
				created_at: Date.now(),
				invoice_id: autumnInvoiceId,
				stripe_id: line.id,
				stripe_invoice_id: replacement.id,
				stripe_invoice_item_id: null,
				stripe_subscription_item_id: null,
				stripe_discountable: false,
			},
		];
	});

	await invoiceLineItemRepo.upsertMany({ db: ctx.db, lineItems: copied });
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
	if (!autumnInvoice) return undefined;

	await copyLineItemRows({
		ctx,
		original,
		replacement,
		autumnInvoiceId: autumnInvoice.id,
	});
	return autumnInvoice;
};

/**
 * Voids an open send-invoice invoice and replaces it with a copy carrying the
 * template's footer/memo. The replacement stays linked to the same subscription
 * and inherits the original's deferred-plan pointers, so paying it has the same
 * effect the original payment would have had.
 *
 * The replacement is finalized before the original is voided, so a failure never
 * leaves the customer without a payable invoice.
 */
export const reissueInvoice = async ({
	ctx,
	invoiceId,
	invoiceTemplateId,
	netTermsDays,
	updateCustomerEmail,
}: {
	ctx: AutumnContext;
	invoiceId: string;
	invoiceTemplateId?: string;
	netTermsDays?: number;
	updateCustomerEmail?: string;
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

	const { dueDate, daysUntilDue } = resolveDueDate({
		stripeInvoice,
		netTermsDays,
		nowMs: Date.now(),
	});

	// Stripe snapshots customer_email at finalization, so this must precede the draft.
	if (updateCustomerEmail) {
		await updateStripeCustomerEmail({
			stripeCli,
			stripeInvoice,
			email: updateCustomerEmail,
		});
	}

	const finalized = await issueReplacement({
		ctx,
		stripeCli,
		invoiceId,
		stripeInvoice,
		template,
		dueDate,
		daysUntilDue,
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
