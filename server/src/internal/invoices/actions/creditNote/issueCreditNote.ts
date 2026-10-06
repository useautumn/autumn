import {
	type ApiCreditNote,
	type CreditNoteDestination,
	ErrCode,
	type IssueCreditNoteParams,
	ProcessorType,
	RecaseError,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "../../InvoiceService";
import { assertInvoiceNotReissued } from "../../invoiceUtils/assertInvoiceNotReissued";
import { invoiceLineItemRepo } from "../../lineItems/repos";
import { updateInvoiceFromStripe } from "../updateFromStripe";
import { buildCreditNoteParams } from "./buildCreditNoteParams";
import { stripeCreditNoteToApi } from "./stripeCreditNoteToApi";

const DESTINATION_FIELD = {
	customer_balance: "credit_amount",
	refund: "refund_amount",
	out_of_band: "out_of_band_amount",
} as const satisfies Record<
	CreditNoteDestination,
	keyof Stripe.CreditNoteCreateParams
>;

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

const assertCreditable = ({
	invoiceId,
	stripeInvoice,
}: {
	invoiceId: string;
	stripeInvoice: Stripe.Invoice;
}) => {
	if (stripeInvoice.status === "draft") {
		throw invalidRequest(
			`Invoice ${invoiceId} is a draft; finalize it before issuing a credit note`,
		);
	}
	if (stripeInvoice.status === "void") {
		throw invalidRequest(`Invoice ${invoiceId} is void and cannot be credited`);
	}
	if (stripeInvoice.status !== "open" && stripeInvoice.status !== "paid") {
		throw invalidRequest(
			`Invoice ${invoiceId} is ${stripeInvoice.status}; only open and paid invoices can be credited`,
		);
	}
};

const listCreditNoteLines = async ({
	stripeCli,
	creditNote,
	previewParams,
}: {
	stripeCli: Stripe;
	creditNote: Stripe.CreditNote;
	previewParams?: Stripe.CreditNoteListPreviewLineItemsParams;
}) => {
	if (!creditNote.lines.has_more) return creditNote.lines.data;
	const list = previewParams
		? stripeCli.creditNotes.listPreviewLineItems({
				...previewParams,
				limit: 100,
			})
		: stripeCli.creditNotes.listLineItems(creditNote.id, { limit: 100 });
	return list.autoPagingToArray({ limit: 10_000 });
};

/**
 * Stripe's preview silently books any unallocated paid amount as out of band,
 * but create rejects it, so the paid portion is sized first and then allocated.
 */
export const issueCreditNote = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: IssueCreditNoteParams;
}): Promise<ApiCreditNote> => {
	const invoiceId = params.invoice_id;
	const row = await InvoiceService.getListRowById({ ctx, id: invoiceId });
	if (!row) throw invalidRequest(`Invoice ${invoiceId} not found`);

	const processorType = row.invoice.processor_type ?? ProcessorType.Stripe;
	if (processorType !== ProcessorType.Stripe || !row.invoice.stripe_id) {
		throw invalidRequest("Only Stripe invoices can be credited");
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: row.invoice.stripe_id,
		expand: [],
	});
	assertInvoiceNotReissued({ invoiceId, stripeInvoice });
	assertCreditable({ invoiceId, stripeInvoice });

	const lineItems = params.lines
		? await invoiceLineItemRepo.getByInvoiceId({ db: ctx.db, invoiceId })
		: [];
	const baseParams = buildCreditNoteParams({
		params,
		invoiceId,
		stripeInvoice,
		lineItems,
	});

	const sizing = await stripeCli.creditNotes.preview(baseParams);
	const creditParams: Stripe.CreditNoteCreateParams =
		sizing.post_payment_amount > 0
			? {
					...baseParams,
					[DESTINATION_FIELD[params.destination]]: sizing.post_payment_amount,
				}
			: baseParams;

	const isPreview = params.preview === true;
	const creditNote = isPreview
		? await stripeCli.creditNotes.preview(creditParams)
		: await stripeCli.creditNotes.create(
				creditParams,
				autumnStripeRequestOptions({ source: "credit_note" }),
			);

	const lines = await listCreditNoteLines({
		stripeCli,
		creditNote,
		previewParams: isPreview ? creditParams : undefined,
	});

	if (!isPreview) {
		await syncCreditedInvoice({
			ctx,
			stripeCli,
			customerId: row.customer_id ?? row.invoice.internal_customer_id,
			stripeInvoiceId: stripeInvoice.id,
			creditNote,
			destination: params.destination,
		});
	}

	return stripeCreditNoteToApi({
		creditNote,
		lines,
		invoiceId,
		destination: params.destination,
		stripeLineIdToAutumn: new Map(
			lineItems
				.filter((line) => line.stripe_id)
				.map((line) => [line.stripe_id as string, line.id]),
		),
		isPreview,
	});
};

/** A full credit can flip an open invoice to paid; refunds are tracked on our row. */
const syncCreditedInvoice = async ({
	ctx,
	stripeCli,
	customerId,
	stripeInvoiceId,
	creditNote,
	destination,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	customerId: string;
	stripeInvoiceId: string;
	creditNote: Stripe.CreditNote;
	destination: CreditNoteDestination;
}) => {
	const refreshed = await getStripeInvoice({
		stripeClient: stripeCli,
		invoiceId: stripeInvoiceId,
		expand: [],
	});
	await updateInvoiceFromStripe({ ctx, customerId, stripeInvoice: refreshed });

	if (destination !== "refund" || creditNote.post_payment_amount <= 0) return;
	await InvoiceService.addRefundedAmount({
		db: ctx.db,
		stripeId: stripeInvoiceId,
		amount: stripeToAtmnAmount({
			amount: creditNote.post_payment_amount,
			currency: creditNote.currency,
		}),
	});
};
