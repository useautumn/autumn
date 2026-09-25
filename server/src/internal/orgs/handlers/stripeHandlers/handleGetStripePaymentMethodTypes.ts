import {
	type InvoicePaymentMethod,
	InvoicePaymentMethodSchema,
	Scopes,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { isStripeConnected } from "../../orgUtils.js";

/** Stripe omits a type the account cannot use; one switched off for display is still accepted on invoices. */
const isSupported = ({
	configuration,
	type,
}: {
	configuration: Stripe.PaymentMethodConfiguration;
	type: InvoicePaymentMethod;
}) => Boolean(configuration[type]);

/** Dashboard-only: invoice payment method types the connected Stripe account supports. */
export const handleGetStripePaymentMethodTypes = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org, env, logger } = ctx;
		if (!isStripeConnected({ org, env })) {
			return c.json({ payment_method_types: null });
		}

		try {
			const stripeCli = createStripeCli({ org, env });
			const configurations = await stripeCli.paymentMethodConfigurations
				.list({ limit: 100 })
				.autoPagingToArray({ limit: 1000 });
			const configuration =
				configurations.find((entry) => entry.is_default && entry.active) ??
				configurations.find((entry) => entry.active);
			if (!configuration) return c.json({ payment_method_types: null });

			return c.json({
				payment_method_types: InvoicePaymentMethodSchema.options.filter(
					(type) => isSupported({ configuration, type }),
				),
			});
		} catch (error) {
			logger.warn(
				`Failed to list Stripe payment method configurations for org ${org.slug}: ${error}`,
			);
			return c.json({ payment_method_types: null });
		}
	},
});
