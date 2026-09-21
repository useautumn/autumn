import {
	ErrCode,
	RecaseError,
	Scopes,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { resolveVercelInstallationId } from "@/external/vercel/misc/vercelInvoiceUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import {
	calculateRefundAmountInCents,
	createRefundAndUpdateInvoice,
	resolveChargeFromInvoice,
	validateChargeRefundable,
} from "./invoiceRefundUtils.js";
import {
	calculateVercelRefundAmount,
	requestVercelRefund,
} from "./refundVercelInvoice.js";

const RefundInvoiceBodySchema = z.object({
	mode: z.enum(["full", "partial"]),
	amount: z.number().positive().optional(),
	reason: z.string().optional(),
});

export const handleRefundInvoice = createRoute({
	scopes: [Scopes.Billing.Write],
	params: z.object({
		customer_id: z.string(),
		stripe_invoice_id: z.string(),
	}),
	body: RefundInvoiceBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, stripe_invoice_id } = c.req.param();
		const { mode, amount, reason } = c.req.valid("json");

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

		// 1. Retrieve the Stripe invoice with payments expanded
		let stripeInvoice: Stripe.Invoice;
		try {
			stripeInvoice = await stripeCli.invoices.retrieve(stripe_invoice_id, {
				expand: ["payments.data.payment.payment_intent"],
			});
		} catch {
			throw new RecaseError({
				message: "Stripe invoice not found",
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		// 2. Vercel invoices have no Stripe charge — refund through Vercel instead
		const vercelInstallationId = await resolveVercelInstallationId({
			stripeCli,
			invoice: stripeInvoice,
		});
		if (vercelInstallationId) {
			const customer = await CusService.get({
				db: ctx.db,
				idOrInternalId: customer_id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const autumnInvoice = await InvoiceService.getByStripeId({
				db: ctx.db,
				stripeId: stripe_invoice_id,
			});
			if (
				!customer ||
				!autumnInvoice ||
				autumnInvoice.internal_customer_id !== customer.internal_id
			) {
				throw new RecaseError({
					message: "Invoice not found for this customer",
					code: ErrCode.InvalidRequest,
					statusCode: 404,
				});
			}

			const paidAmount = stripeToAtmnAmount({
				amount: stripeInvoice.amount_paid,
				currency: stripeInvoice.currency,
			});
			const refundAmount = calculateVercelRefundAmount({
				mode,
				amount,
				refundableAmount: paidAmount - autumnInvoice.refunded_amount,
				currency: stripeInvoice.currency,
			});

			const { vercelInvoiceId } = await requestVercelRefund({
				customer,
				stripeInvoice,
				installationId: vercelInstallationId,
				amount: refundAmount,
				reason,
				testOptions: ctx.testOptions,
			});

			return c.json({
				processor: "vercel",
				vercel_invoice_id: vercelInvoiceId,
				amount: refundAmount,
				currency: stripeInvoice.currency,
				status: "requested",
			});
		}

		// 3. Resolve the charge from the invoice's payments
		const charge = await resolveChargeFromInvoice({
			stripeCli,
			stripeInvoice,
		});

		if (!charge) {
			throw new RecaseError({
				message: "This invoice has no associated charge to refund",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// 4. Validate and calculate
		const refundableAmountInCents = validateChargeRefundable({ charge });
		const refundAmountInCents = calculateRefundAmountInCents({
			mode,
			amount,
			refundableAmountInCents,
			currency: charge.currency,
		});

		// 5. Issue the refund and update the DB
		const stripeRefund = await createRefundAndUpdateInvoice({
			stripeCli,
			db: ctx.db,
			chargeId: charge.id,
			stripeInvoiceId: stripe_invoice_id,
			amountInCents: refundAmountInCents,
		});

		return c.json({
			processor: "stripe",
			refund_id: stripeRefund.id,
			charge_id: charge.id,
			amount: stripeToAtmnAmount({
				amount: stripeRefund.amount,
				currency: stripeRefund.currency,
			}),
			currency: stripeRefund.currency,
			status: stripeRefund.status,
		});
	},
});
