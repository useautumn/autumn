import { generateKsuid } from "@autumn/ksuid";
import {
	type CreateInvoicePreview,
	cusProductToProduct,
	type DbInvoiceLineItem,
	ErrCode,
	type FullCustomer,
	type InsertDbInvoiceLineItem,
	type InvoiceTemplate,
	MetadataType,
	type PreviewInvoiceCredits,
	ProcessorType,
	RecaseError,
	type ReissueCustomerOverrides,
	type ReissueInvoiceOverrides,
	type ReissueLineEdits,
	secondsToMs,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeLineItemsToDbLineItems } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines";
import {
	addStripeInvoiceLines,
	createStripeInvoice,
	finalizeStripeInvoice,
} from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { stripeCustomerToInvoiceCredits } from "@/internal/billing/v2/utils/billingPlan/preview/invoiceCredits/stripeCustomerToInvoiceCredits";
import { checkoutRepo } from "@/internal/checkouts";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { InvoiceTemplateService } from "@/internal/orgs/invoiceTemplates/InvoiceTemplateService";
import { type InvoiceListRow, InvoiceService } from "../InvoiceService";
import { invoiceLineItemRepo } from "../lineItems/repos";
import { applyReissueCustomerOverrides } from "./reissue/applyReissueCustomerOverrides";
import { applyReissueLineEdits } from "./reissue/applyReissueLineEdits";
import { previewReissuedInvoice } from "./reissue/previewReissuedInvoice";
import { updateInvoiceFromStripe } from "./updateFromStripe";
import { upsertInvoiceFromStripe } from "./upsertFromStripe";
import { voidInvoice } from "./voidInvoice";

const ADD_LINES_BATCH_SIZE = 100;

type ReissueInvoiceResult = {
	replacement: InvoiceListRow | null;
	voidedInvoiceId: string | null;
	creditNoteId: string | null;
	preview: CreateInvoicePreview;
};

/** An explicit null clears the field rather than falling back to the original. */
const overrideOrInherit = ({
	override,
	inherited,
}: {
	override?: string | null;
	inherited?: string | null;
}) =>
	override === undefined ? (inherited ?? undefined) : (override ?? undefined);

const stripeInvoiceToStripeCustomerId = ({
	stripeInvoice,
}: {
	stripeInvoice: Stripe.Invoice;
}) => {
	const stripeCusId =
		typeof stripeInvoice.customer === "string"
			? stripeInvoice.customer
			: stripeInvoice.customer?.id;
	if (!stripeCusId) {
		throw invalidRequest("Original invoice has no Stripe customer");
	}
	return stripeCusId;
};

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

const loadReissuableStripeInvoice = async ({
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

	const replacementId = stripeInvoice.metadata?.autumn_reissued_to;
	if (replacementId) {
		throw invalidRequest(
			`Invoice ${row.invoice.id} was already reissued as Stripe invoice ${replacementId}`,
		);
	}
	if (stripeInvoice.status === "void") {
		throw invalidRequest(
			`Invoice ${row.invoice.id} is void and cannot be reissued`,
		);
	}
	if (stripeInvoice.status !== "open" && stripeInvoice.status !== "paid") {
		throw invalidRequest(
			`Invoice ${row.invoice.id} is ${stripeInvoice.status}; only open and paid invoices can be reissued`,
		);
	}
	return { stripeCli, stripeInvoice };
};

/**
 * Keeps the original deadline unless it has passed, in which case new terms are
 * required. A card invoice has no deadline unless terms are given, which turns
 * the replacement into a send-invoice one.
 */
const resolveCollection = ({
	stripeInvoice,
	netTermsDays,
	nowMs,
}: {
	stripeInvoice: Stripe.Invoice;
	netTermsDays?: number;
	nowMs: number;
}): {
	collectionMethod: "send_invoice" | "charge_automatically";
	dueDate?: number;
	daysUntilDue?: number;
} => {
	if (netTermsDays) {
		return { collectionMethod: "send_invoice", daysUntilDue: netTermsDays };
	}
	if (stripeInvoice.collection_method === "charge_automatically") {
		return { collectionMethod: "charge_automatically" };
	}

	const dueDateMs = stripeInvoice.due_date
		? secondsToMs(stripeInvoice.due_date)
		: 0;
	if (dueDateMs <= nowMs) {
		throw invalidRequest(
			"The original invoice is already past due; pass net_terms_days to give the replacement a new due date",
		);
	}
	return {
		collectionMethod: "send_invoice",
		dueDate: stripeInvoice.due_date ?? undefined,
	};
};

const stripeLinesToAddLineParams = ({
	lines,
	lineTaxRates = "keep",
}: {
	lines: Stripe.InvoiceLineItem[];
	/**
	 * `keep` copies the original's per-line rates, `inherit` lets the invoice's
	 * default rate apply, and `none` taxes the line at nothing regardless of it.
	 */
	lineTaxRates?: "keep" | "inherit" | "none";
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
		tax_rates:
			lineTaxRates === "none"
				? ""
				: lineTaxRates === "keep" && line.taxes?.length
					? line.taxes.flatMap((tax) =>
							tax.tax_rate_details?.tax_rate
								? [tax.tax_rate_details.tax_rate]
								: [],
						)
					: undefined,
		metadata: { ...(line.metadata ?? {}), autumn_reissued_from_line: line.id },
	}));

/**
 * A draft that survives a failed build is inert but clutters the customer.
 * Stripe refuses to delete a subscription-linked draft, so that case is logged.
 */
const deleteDraft = async ({
	ctx,
	stripeCli,
	draftId,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	draftId: string;
}) => {
	await stripeCli.invoices.del(draftId).catch((error) => {
		ctx.logger.error(
			`[reissueInvoice] failed to delete draft ${draftId}: ${error}`,
		);
	});
};

const createReplacementDraft = async ({
	ctx,
	customerId,
	stripeCli,
	stripeInvoice,
	template,
	collectionMethod,
	dueDate,
	daysUntilDue,
	paymentMethodTypes,
	overrides,
	lineEdits,
	storedLines,
	dropDeferredPointer,
	linkSubscription,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	collectionMethod: "send_invoice" | "charge_automatically";
	dueDate?: number;
	daysUntilDue?: number;
	paymentMethodTypes?: string[];
	overrides?: ReissueInvoiceOverrides;
	lineEdits?: ReissueLineEdits;
	storedLines: DbInvoiceLineItem[];
	dropDeferredPointer: boolean;
	/** A linked draft fires invoice.created against the subscription's products. */
	linkSubscription: boolean;
}) => {
	const stripeSubId = linkSubscription
		? stripeInvoiceToStripeSubscriptionId(stripeInvoice)
		: undefined;
	const stripeCusId =
		typeof stripeInvoice.customer === "string"
			? stripeInvoice.customer
			: stripeInvoice.customer?.id;
	if (!stripeCusId) {
		throw invalidRequest("Original invoice has no Stripe customer");
	}

	// Lines are resolved first so a bad edit fails before any draft exists.
	const lines = await applyReissueLineEdits({
		ctx,
		customerId,
		lines: stripeLinesToAddLineParams({
			lines: await getStripeInvoiceLineItems({
				stripeClient: stripeCli,
				invoiceId: stripeInvoice.id,
			}),
			lineTaxRates:
				overrides?.tax_rate_id === undefined
					? "keep"
					: overrides.tax_rate_id === null
						? "none"
						: "inherit",
		}),
		storedLines,
		edits: lineEdits,
		currency: stripeInvoice.currency,
	});

	const draft = await createStripeInvoice({
		stripeCli,
		stripeCusId,
		stripeSubId,
		currency: stripeSubId ? undefined : stripeInvoice.currency,
		collectionMethod,
		dueDate,
		daysUntilDue,
		footer: overrideOrInherit({
			override: overrides?.footer,
			inherited: template?.footer ?? stripeInvoice.footer,
		}),
		description: overrideOrInherit({
			override: overrides?.memo,
			inherited: template?.memo ?? stripeInvoice.description,
		}),
		// The org's invoice methods (e.g. customer_balance) are for send-invoice
		// only; a card replacement uses the customer's payment method as before.
		paymentMethodTypes:
			collectionMethod === "send_invoice"
				? (paymentMethodTypes as never)
				: undefined,
		metadata: {
			...inheritedMetadata({ stripeInvoice, dropDeferredPointer }),
			autumn_reissued_from: stripeInvoice.id,
			autumn_source_billing_reason: stripeInvoice.billing_reason ?? "",
		},
		// Stripe would recompute automatic tax over the cleared rates.
		automaticTax:
			overrides?.tax_rate_id === null
				? false
				: (stripeInvoice.automatic_tax?.enabled ?? false),
		// Omitted keeps the original's rate; null clears it; a value replaces it.
		defaultTaxRates:
			overrides?.tax_rate_id === undefined
				? stripeInvoice.default_tax_rates?.map((rate) =>
						typeof rate === "string" ? rate : rate.id,
					)
				: overrides.tax_rate_id
					? [overrides.tax_rate_id]
					: [],
	});

	const invoiceFields: Stripe.InvoiceUpdateParams = {
		// A subscription's tax rate is inherited at creation; Stripe clears it
		// only on update, and only for the empty string. Automatic tax is
		// inherited the same way and would recompute the tax that was dropped.
		...(overrides?.tax_rate_id === null
			? { default_tax_rates: "", automatic_tax: { enabled: false } }
			: {}),
		...(overrides?.custom_fields !== undefined
			? {
					custom_fields: overrides.custom_fields.length
						? overrides.custom_fields
						: null,
				}
			: {}),
		...(overrides?.account_tax_ids !== undefined
			? { account_tax_ids: overrides.account_tax_ids }
			: {}),
	};
	// The draft exists from here on, so anything that fails must take it with it.
	try {
		if (Object.keys(invoiceFields).length > 0) {
			await stripeCli.invoices.update(draft.id, invoiceFields);
		}

		let withLines = draft;
		for (let start = 0; start < lines.length; start += ADD_LINES_BATCH_SIZE) {
			withLines = await addStripeInvoiceLines({
				stripeCli,
				invoiceId: draft.id,
				lines: lines.slice(start, start + ADD_LINES_BATCH_SIZE),
			});
		}
		return withLines;
	} catch (error) {
		await deleteDraft({ ctx, stripeCli, draftId: draft.id });
		throw error;
	}
};

/**
 * Stripe is the only source of truth for tax, so a preview builds the real
 * draft, reads its totals and deletes it. The draft is never linked to the
 * subscription so its invoice.created webhook is a no-op, and customer
 * corrections are not applied (a preview must not write).
 */
const previewReplacementDraft = async ({
	ctx,
	customerId,
	stripeCli,
	stripeInvoice,
	template,
	collectionMethod,
	dueDate,
	daysUntilDue,
	overrides,
	lineEdits,
	storedLines,
	dropDeferredPointer,
	credits,
	dueDateMs,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	collectionMethod: "send_invoice" | "charge_automatically";
	dueDate?: number;
	daysUntilDue?: number;
	overrides?: ReissueInvoiceOverrides;
	lineEdits?: ReissueLineEdits;
	storedLines: DbInvoiceLineItem[];
	dropDeferredPointer: boolean;
	credits?: PreviewInvoiceCredits;
	dueDateMs: number | null;
}): Promise<CreateInvoicePreview> => {
	const draft = await createReplacementDraft({
		ctx,
		customerId,
		stripeCli,
		stripeInvoice,
		template,
		collectionMethod,
		dueDate,
		daysUntilDue,
		paymentMethodTypes: ctx.org.config.allowed_payment_methods ?? undefined,
		overrides,
		lineEdits,
		storedLines,
		dropDeferredPointer,
		linkSubscription: false,
	});
	try {
		return await previewReissuedInvoice({
			stripeInvoice: draft,
			lines: await getStripeInvoiceLineItems({
				stripeClient: stripeCli,
				invoiceId: draft.id,
			}),
			storedLines,
			credits,
			dueDateMs,
		});
	} finally {
		await deleteDraft({ ctx, stripeCli, draftId: draft.id });
	}
};

/**
 * Creates and finalizes the replacement, then retires the original: an open
 * invoice is voided and its deferred pointers move across, while a paid one
 * keeps its money and gets a credit note instead.
 */
const issueReplacement = async ({
	ctx,
	customerId,
	stripeCli,
	invoiceId,
	stripeInvoice,
	template,
	collectionMethod,
	dueDate,
	daysUntilDue,
	overrides,
	lineEdits,
	storedLines,
	creditOriginal,
	customerAdjusted,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCli: Stripe;
	invoiceId: string;
	stripeInvoice: Stripe.Invoice;
	template?: InvoiceTemplate;
	collectionMethod: "send_invoice" | "charge_automatically";
	dueDate?: number;
	daysUntilDue?: number;
	overrides?: ReissueInvoiceOverrides;
	lineEdits?: ReissueLineEdits;
	storedLines: DbInvoiceLineItem[];
	creditOriginal: boolean;
	/** A corrected address or tax id legitimately moves the tax. */
	customerAdjusted: boolean;
}): Promise<{ finalized: Stripe.Invoice; creditNoteId: string | null }> => {
	const draft = await createReplacementDraft({
		ctx,
		customerId,
		stripeCli,
		stripeInvoice,
		template,
		collectionMethod,
		dueDate,
		daysUntilDue,
		paymentMethodTypes: ctx.org.config.allowed_payment_methods ?? undefined,
		overrides,
		lineEdits,
		storedLines,
		dropDeferredPointer: creditOriginal,
		linkSubscription: true,
	});

	// The total is only guaranteed to match when nothing was adjusted.
	const adjusted = Boolean(overrides || lineEdits || customerAdjusted);
	if (!adjusted && draft.total !== stripeInvoice.total) {
		await deleteDraft({ ctx, stripeCli, draftId: draft.id });
		throw new RecaseError({
			message: `Replacement total (${draft.total}) does not match the original (${stripeInvoice.total}); the invoice was not reissued`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	if (creditOriginal) {
		return creditAndFinalize({ ctx, stripeCli, stripeInvoice, draft });
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
		// The original keeps standing; retire the replacement instead.
		await repointDeferredReferences({
			ctx,
			fromStripeInvoiceId: finalized.id,
			toStripeInvoiceId: stripeInvoice.id,
		}).catch(() => undefined);
		try {
			await stripeCli.invoices.voidInvoice(finalized.id);
		} catch {
			throw new RecaseError({
				message: `Invoice ${invoiceId} could not be retired while being reissued; its replacement ${finalized.id} is still open and must be voided manually`,
				code: ErrCode.InternalError,
				statusCode: 409,
			});
		}
		// Stripe may have collected the original between our read and the void.
		if (await isNowPaid({ stripeCli, stripeInvoiceId: stripeInvoice.id })) {
			throw new RecaseError({
				message: `Invoice ${invoiceId} was paid while being reissued; nothing was changed`,
				code: ErrCode.InvalidRequest,
				statusCode: 409,
			});
		}
		throw error;
	}

	// The original is retired, so a card replacement can be charged now.
	return {
		finalized: await collectRemainderNow({ ctx, stripeCli, finalized }),
		creditNoteId: null,
	};
};

const isNowPaid = async ({
	stripeCli,
	stripeInvoiceId,
}: {
	stripeCli: Stripe;
	stripeInvoiceId: string;
}) => {
	const invoice = await stripeCli.invoices
		.retrieve(stripeInvoiceId)
		.catch(() => null);
	return invoice?.status === "paid";
};

/**
 * Returns a paid invoice's money to the customer's Stripe balance and finalizes
 * the replacement, which that balance then settles. No refund is issued: the
 * cash never moves.
 *
 * The credit must exist before finalization or Stripe bills the replacement in
 * full, so a finalization failure has to hand the credit back — a credit note
 * on a paid invoice cannot be voided, which leaves a reversing balance entry.
 */
const creditAndFinalize = async ({
	ctx,
	stripeCli,
	stripeInvoice,
	draft,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	draft: Stripe.Invoice;
}): Promise<{ finalized: Stripe.Invoice; creditNoteId: string | null }> => {
	const amount = stripeInvoice.amount_paid;
	const creditNote = await stripeCli.creditNotes.create({
		invoice: stripeInvoice.id,
		amount,
		credit_amount: amount,
		reason: "order_change",
		memo: "Reissued as a corrected invoice",
	});

	let finalized: Stripe.Invoice;
	try {
		finalized = await finalizeStripeInvoice({
			stripeCli,
			invoiceId: draft.id,
			autoAdvance: true,
		});
	} catch (error) {
		try {
			await reverseCredit({ stripeCli, stripeInvoice, creditNote, amount });
		} finally {
			await deleteDraft({ ctx, stripeCli, draftId: draft.id });
		}
		throw error;
	}

	return {
		finalized: await collectRemainderNow({ ctx, stripeCli, finalized }),
		creditNoteId: creditNote.id,
	};
};

/**
 * Stripe waits about an hour before first attempting a card invoice created
 * through the API, so a card replacement is charged now instead. A declined
 * card leaves it open for Stripe's retries, like any other invoice.
 */
const collectRemainderNow = async ({
	ctx,
	stripeCli,
	finalized,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	finalized: Stripe.Invoice;
}): Promise<Stripe.Invoice> => {
	if (
		finalized.collection_method !== "charge_automatically" ||
		finalized.status !== "open"
	) {
		return finalized;
	}
	// The reissue is already complete here, so a collection hiccup must not
	// report it as failed; the replacement simply stays open.
	try {
		const paymentMethod = await getCusPaymentMethod({
			stripeCli,
			stripeId: stripeInvoiceToStripeCustomerId({ stripeInvoice: finalized }),
		});
		const { paid, invoice } = await payForInvoice({
			stripeCli,
			invoiceId: finalized.id,
			paymentMethod,
			logger: ctx.logger,
			errorOnFail: false,
		});
		return paid && invoice ? invoice : finalized;
	} catch (error) {
		ctx.logger.warn(
			`[reissueInvoice] replacement ${finalized.id} left open; collection failed: ${error}`,
		);
		return finalized;
	}
};

const reverseCredit = async ({
	stripeCli,
	stripeInvoice,
	creditNote,
	amount,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	creditNote: Stripe.CreditNote;
	amount: number;
}) => {
	const stripeCusId = stripeInvoiceToStripeCustomerId({ stripeInvoice });
	try {
		await stripeCli.customers.createBalanceTransaction(stripeCusId, {
			amount,
			currency: stripeInvoice.currency,
			description: `Reversing credit note ${creditNote.number ?? creditNote.id}: the reissue of ${stripeInvoice.id} failed`,
			metadata: { autumn_reversed_credit_note: creditNote.id },
		});
	} catch {
		throw new RecaseError({
			message: `The reissue of ${stripeInvoice.id} failed after credit note ${creditNote.id} was issued, and the credit could not be returned; the customer holds it until it is reversed manually`,
			code: ErrCode.InternalError,
			statusCode: 409,
		});
	}
};

/** A paid original keeps its own deferred pointer, so the replacement must not carry one. */
const inheritedMetadata = ({
	stripeInvoice,
	dropDeferredPointer,
}: {
	stripeInvoice: Stripe.Invoice;
	dropDeferredPointer: boolean;
}) => {
	const metadata = { ...(stripeInvoice.metadata ?? {}) };
	if (dropDeferredPointer) delete metadata.autumn_metadata_id;
	return metadata;
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

	const copied: InsertDbInvoiceLineItem[] = originalRows.flatMap((row) => {
		const line = row.stripe_id
			? replacementLineBySource.get(row.stripe_id)
			: undefined;
		if (!line) return [];
		// Adjusted lines bill a different amount, so the stored row follows Stripe.
		const amount = stripeToAtmnAmount({
			amount: line.amount,
			currency: replacement.currency,
		});
		return [
			{
				...row,
				id: generateKsuid({ prefix: "invoice_li_" }),
				created_at: Date.now(),
				amount,
				amount_after_discounts: amount,
				invoice_id: autumnInvoiceId,
				stripe_id: line.id,
				stripe_invoice_id: replacement.id,
				stripe_invoice_item_id: null,
				stripe_subscription_item_id: null,
				stripe_discountable: false,
			},
		];
	});

	// Lines the reissue added have no original row behind them.
	const copiedStripeIds = new Set(copied.map((row) => row.stripe_id));
	const addedLines = replacementLines.filter(
		(line) => !copiedStripeIds.has(line.id),
	);
	const added = stripeLineItemsToDbLineItems({
		stripeLineItems: addedLines,
		stripeDiscounts: [],
		invoiceId: autumnInvoiceId,
		stripeInvoiceId: replacement.id,
	});

	const lineItems = [...copied, ...added];
	if (lineItems.length === 0) return;
	await invoiceLineItemRepo.upsertMany({ db: ctx.db, lineItems });
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
	preview,
	invoiceOverrides,
	customerOverrides,
	lineEdits,
}: {
	ctx: AutumnContext;
	invoiceId: string;
	invoiceTemplateId?: string;
	netTermsDays?: number;
	updateCustomerEmail?: string;
	preview?: boolean;
	invoiceOverrides?: ReissueInvoiceOverrides;
	customerOverrides?: ReissueCustomerOverrides;
	lineEdits?: ReissueLineEdits;
}): Promise<ReissueInvoiceResult> => {
	if (
		updateCustomerEmail &&
		customerOverrides?.email &&
		updateCustomerEmail !== customerOverrides.email
	) {
		throw invalidRequest(
			"update_customer_email and customer.email disagree; pass only one",
		);
	}

	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) throw invalidRequest(`Invoice ${invoiceId} not found`);

	const { stripeCli, stripeInvoice } = await loadReissuableStripeInvoice({
		ctx,
		row,
	});

	// A paid invoice keeps its money and gets a credit note; an open one is voided.
	const creditOriginal = stripeInvoice.status === "paid";

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

	const { collectionMethod, dueDate, daysUntilDue } = resolveCollection({
		stripeInvoice,
		netTermsDays,
		nowMs: Date.now(),
	});

	const previewCustomerId = row.customer_id ?? row.invoice.internal_customer_id;
	const storedLines = await invoiceLineItemRepo.getByInvoiceIds({
		db: ctx.db,
		invoiceIds: [row.invoice.id],
	});

	const dueDateMs = dueDate
		? secondsToMs(dueDate)
		: daysUntilDue
			? Date.now() + daysUntilDue * 24 * 60 * 60 * 1000
			: null;
	const credits = stripeCustomerToInvoiceCredits({
		stripeCustomer: await getExpandedStripeCustomer({
			ctx,
			stripeCustomerId: stripeInvoiceToStripeCustomerId({ stripeInvoice }),
		}),
		currency: stripeInvoice.currency,
	});

	if (preview) {
		return {
			replacement: null,
			voidedInvoiceId: null,
			creditNoteId: null,
			preview: await previewReplacementDraft({
				ctx,
				customerId: previewCustomerId,
				stripeCli,
				stripeInvoice,
				template,
				collectionMethod,
				dueDate,
				daysUntilDue,
				overrides: invoiceOverrides,
				lineEdits,
				storedLines,
				dropDeferredPointer: creditOriginal,
				credits,
				dueDateMs,
			}),
		};
	}

	// Stripe snapshots the customer's email, name, address and tax ids at
	// finalization, so these must precede the draft.
	if (updateCustomerEmail || customerOverrides) {
		await applyReissueCustomerOverrides({
			ctx,
			stripeCli,
			stripeCustomerId: stripeInvoiceToStripeCustomerId({ stripeInvoice }),
			customerId: previewCustomerId,
			overrides: customerOverrides,
			email: updateCustomerEmail,
		});
	}

	const { finalized, creditNoteId } = await issueReplacement({
		ctx,
		creditOriginal,
		// Only a location or tax registration can move what Stripe charges.
		customerAdjusted: Boolean(
			customerOverrides?.address || customerOverrides?.tax_ids,
		),
		customerId: previewCustomerId,
		stripeCli,
		invoiceId,
		stripeInvoice,
		template,
		collectionMethod,
		dueDate,
		daysUntilDue,
		overrides: invoiceOverrides,
		lineEdits,
		storedLines,
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

	// The response describes what was issued, adjustments included.
	const issuedPreview = previewReissuedInvoice({
		stripeInvoice: finalized,
		lines: await getStripeInvoiceLineItems({
			stripeClient: stripeCli,
			invoiceId: finalized.id,
		}),
		storedLines,
		credits,
		dueDateMs,
		settled: true,
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

	return {
		replacement,
		voidedInvoiceId: creditOriginal ? null : invoiceId,
		creditNoteId,
		preview: issuedPreview,
	};
};
