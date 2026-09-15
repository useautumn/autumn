import { type Customer, ErrCode, invoices, RecaseError } from "@autumn/shared";
import { Marketplace } from "@vercel/sdk/sdk/marketplace.js";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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
 * (`POST /v1/installations/{id}/billing/invoices/{invoiceId}/actions`) and
 * increments `refunded_amount` on the Autumn invoice. Vercel returns 204 and
 * settles the refund asynchronously.
 */
export const refundVercelInvoice = async ({
	db,
	customer,
	stripeInvoice,
	installationId,
	amount,
	refundableAmount,
	reason = DEFAULT_VERCEL_REFUND_REASON,
	testOptions,
}: {
	db: DrizzleCli;
	customer: Customer;
	stripeInvoice: Stripe.Invoice;
	installationId: string;
	amount: number;
	/** Amount paid; the reservation guards `refunded_amount + amount <= paid`. */
	refundableAmount: number;
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

	// Reserve the amount atomically before calling Vercel so concurrent
	// requests can't both refund the same balance.
	const reserved = await db
		.update(invoices)
		.set({
			refunded_amount: sql`${invoices.refunded_amount} + ${amount}`,
		})
		.where(
			and(
				eq(invoices.stripe_id, stripeInvoice.id),
				sql`${invoices.refunded_amount} + ${amount} <= ${refundableAmount}`,
			),
		)
		.returning({ id: invoices.id });

	if (reserved.length === 0) {
		throw new RecaseError({
			message: "Refund amount exceeds the remaining refundable balance",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const marketplace = new Marketplace({
		bearerToken: accessToken,
		serverURL: getVercelSdkServerURL(testOptions),
	});

	try {
		await marketplace.updateInvoice({
			integrationConfigurationId: installationId,
			invoiceId: vercelInvoiceId,
			requestBody: {
				action: "refund",
				reason,
				total: toVercelAmountString(amount),
			},
		});
	} catch (error) {
		await db
			.update(invoices)
			.set({
				refunded_amount: sql`${invoices.refunded_amount} - ${amount}`,
			})
			.where(eq(invoices.stripe_id, stripeInvoice.id));
		throw error;
	}

	return { vercelInvoiceId, installationId };
};
