import { ErrCode, RecaseError, stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	calculateRefundAmountInCents,
	resolveChargeFromInvoice,
	validateChargeRefundable,
} from "./invoiceRefundUtils.js";

const RefundInvoiceBodySchema = z.object({
	mode: z.enum(["full", "partial"]),
	amount: z.number().positive().optional(),
});

export const handleRefundInvoice = createRoute({
	params: z.object({
		customer_id: z.string(),
		stripe_invoice_id: z.string(),
	}),
	body: RefundInvoiceBodySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { stripe_invoice_id } = c.req.param();
		const { mode, amount } = c.req.valid("json");

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

		// 2. Resolve the charge from the invoice's payments
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

		// 3. Validate and calculate
		const refundableAmountInCents = validateChargeRefundable({ charge });
		const refundAmountInCents = calculateRefundAmountInCents({
			mode,
			amount,
			refundableAmountInCents,
			currency: charge.currency,
		});

		// 4. Issue the refund
		const stripeRefund = await stripeCli.refunds.create({
			charge: charge.id,
			amount: refundAmountInCents,
		});

		return c.json({
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
