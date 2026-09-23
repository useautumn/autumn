import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import type Stripe from "stripe";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";

const paymentMethodToRow = ({
	paymentMethod,
	defaultPaymentMethodId,
}: {
	paymentMethod: Stripe.PaymentMethod;
	defaultPaymentMethodId: string | null;
}) => ({
	id: paymentMethod.id,
	type: paymentMethod.type,
	brand: paymentMethod.card?.brand ?? null,
	last4:
		paymentMethod.card?.last4 ??
		paymentMethod.us_bank_account?.last4 ??
		paymentMethod.sepa_debit?.last4 ??
		null,
	exp_month: paymentMethod.card?.exp_month ?? null,
	exp_year: paymentMethod.card?.exp_year ?? null,
	is_default: paymentMethod.id === defaultPaymentMethodId,
});

/** Dashboard-only: the customer's saved Stripe payment methods, for choosing which one to charge. */
export const handleListCustomerPaymentMethods = createRoute({
	scopes: [Scopes.Customers.Read],
	params: z.object({ customer_id: z.string() }),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customer_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		if (!customer) {
			throw new RecaseError({
				message: `Customer ${customer_id} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: 404,
			});
		}

		const stripeCustomerId = customer.processor?.id;
		if (!stripeCustomerId) return c.json({ payment_methods: [] });

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const stripeCustomer = await stripeCli.customers.retrieve(stripeCustomerId);
		if (stripeCustomer.deleted) return c.json({ payment_methods: [] });

		const defaultPaymentMethod =
			stripeCustomer.invoice_settings.default_payment_method;
		const defaultPaymentMethodId =
			typeof defaultPaymentMethod === "string"
				? defaultPaymentMethod
				: (defaultPaymentMethod?.id ?? null);

		const paymentMethods: Stripe.PaymentMethod[] = [];
		for await (const paymentMethod of stripeCli.paymentMethods.list({
			customer: stripeCustomerId,
			limit: 100,
		})) {
			paymentMethods.push(paymentMethod);
		}
		paymentMethods.sort((a, b) => b.created - a.created);

		return c.json({
			payment_methods: paymentMethods.map((paymentMethod) =>
				paymentMethodToRow({ paymentMethod, defaultPaymentMethodId }),
			),
		});
	},
});
