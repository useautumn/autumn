import type { ReissueCustomerOverrides } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

/**
 * Writes the customer-level corrections. These persist whether or not the
 * reissue completes: an address or tax number fixed here is meant to hold for
 * this invoice and every later one.
 */
export const applyReissueCustomerOverrides = async ({
	ctx,
	stripeCli,
	stripeCustomerId,
	customerId,
	overrides,
	email,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	stripeCustomerId: string;
	customerId: string;
	overrides?: ReissueCustomerOverrides;
	email?: string;
}) => {
	const resolvedEmail = email ?? overrides?.email;
	const stripeUpdate: Stripe.CustomerUpdateParams = {
		...(resolvedEmail ? { email: resolvedEmail } : {}),
		...(overrides?.name ? { name: overrides.name } : {}),
		...(overrides?.address ? { address: overrides.address } : {}),
		...(overrides?.invoice_settings_custom_fields !== undefined
			? {
					invoice_settings: {
						custom_fields: overrides.invoice_settings_custom_fields,
					},
				}
			: {}),
	};

	if (Object.keys(stripeUpdate).length > 0) {
		await stripeCli.customers.update(stripeCustomerId, stripeUpdate);
	}

	if (overrides?.tax_ids) {
		const existing = await stripeCli.customers.listTaxIds(stripeCustomerId, {
			limit: 100,
		});
		await Promise.all(
			existing.data.map((taxId) =>
				stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id),
			),
		);
		await Promise.all(
			overrides.tax_ids.map((taxId) =>
				stripeCli.customers.createTaxId(stripeCustomerId, {
					type: taxId.type as Stripe.CustomerCreateTaxIdParams.Type,
					value: taxId.value,
				}),
			),
		);
	}

	// Autumn is the source of truth the next getOrCreateStripeCustomer pushes to
	// Stripe, so an email fixed only in Stripe would come straight back.
	if (resolvedEmail || overrides?.name) {
		await CusService.update({
			ctx,
			idOrInternalId: customerId,
			update: {
				...(resolvedEmail ? { email: resolvedEmail } : {}),
				...(overrides?.name ? { name: overrides.name } : {}),
			},
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "reissueInvoice:customer",
		});
	}
};
