import { type Customer, ErrCode, RecaseError } from "@autumn/shared";
import { Marketplace } from "@vercel/sdk/sdk/marketplace.js";
import type Stripe from "stripe";
import { getVercelInvoiceId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import {
	getVercelSdkServerURL,
	type VercelSdkTestOptions,
} from "@/external/vercel/misc/vercelSdkOptions.js";

export const DEFAULT_VERCEL_REFUND_REASON = "Refund issued from Autumn";

/** Vercel's Invoice Actions API takes `total` as a dollar-based decimal string. */
export const toVercelAmountString = (amount: number): string =>
	amount.toFixed(2);

const roundToCents = (amount: number): number => Math.round(amount * 100) / 100;

export const calculateVercelRefundAmount = ({
	mode,
	amount,
	refundableAmount,
	currency,
}: {
	mode: "full" | "partial";
	amount?: number;
	refundableAmount: number;
	currency: string;
}): number => {
	if (refundableAmount <= 0) {
		throw new RecaseError({
			message: "This invoice has already been fully refunded",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (mode === "full") return roundToCents(refundableAmount);

	const centAmount = amount ? roundToCents(amount) : 0;
	if (centAmount <= 0) {
		throw new RecaseError({
			message: "Amount is required for partial refunds",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (centAmount > refundableAmount) {
		throw new RecaseError({
			message: `Refund amount exceeds the refundable balance of ${refundableAmount} ${currency.toUpperCase()}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return centAmount;
};

/**
 * Requests a refund through Vercel's Invoice Actions API
 * (`POST /v1/installations/{id}/billing/invoices/{invoiceId}/actions`).
 * Vercel returns 204 and settles asynchronously; `refunded_amount` is only
 * written when the `marketplace.invoice.refunded` webhook confirms it.
 * Vercel itself rejects a second request while one is `refund_requested`.
 */
export const requestVercelRefund = async ({
	customer,
	stripeInvoice,
	installationId,
	amount,
	reason = DEFAULT_VERCEL_REFUND_REASON,
	testOptions,
}: {
	customer: Customer;
	stripeInvoice: Stripe.Invoice;
	installationId: string;
	amount: number;
	reason?: string;
	testOptions?: VercelSdkTestOptions;
}): Promise<{ vercelInvoiceId: string; installationId: string }> => {
	const vercelInvoiceId = getVercelInvoiceId(stripeInvoice);
	if (!vercelInvoiceId) {
		throw new RecaseError({
			message:
				"This Vercel invoice has no Vercel invoice ID on record and cannot be refunded from Autumn. Please contact Vercel support.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const accessToken = customer.processors?.vercel?.access_token;
	if (!accessToken) {
		throw new RecaseError({
			message: "Customer is missing Vercel installation credentials",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const marketplace = new Marketplace({
		bearerToken: accessToken,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	await marketplace.updateInvoice({
		integrationConfigurationId: installationId,
		invoiceId: vercelInvoiceId,
		requestBody: {
			action: "refund",
			reason,
			total: toVercelAmountString(amount),
		},
	});

	return { vercelInvoiceId, installationId };
};
