import type { ReissueCustomerOverrides } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const taxIdKey = ({ type, value }: { type: string; value: string }) =>
	`${type}:${value}`;

/**
 * Makes the customer's registrations equal the given set. New ones are created
 * before anything is deleted, so a rejected number leaves the old set intact.
 */
const replaceCustomerTaxIds = async ({
	stripeCli,
	stripeCustomerId,
	taxIds,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	taxIds: { type: string; value: string }[];
}) => {
	const existing = await stripeCli.customers.listTaxIds(stripeCustomerId, {
		limit: 100,
	});
	const wanted = new Set(taxIds.map(taxIdKey));
	const kept = new Set(
		existing.data.filter((taxId) => wanted.has(taxIdKey(taxId))).map(taxIdKey),
	);

	const created: Stripe.TaxId[] = [];
	try {
		for (const taxId of taxIds) {
			if (kept.has(taxIdKey(taxId))) continue;
			created.push(
				await stripeCli.customers.createTaxId(stripeCustomerId, {
					type: taxId.type as Stripe.CustomerCreateTaxIdParams.Type,
					value: taxId.value,
				}),
			);
		}
	} catch (error) {
		await Promise.all(
			created.map((taxId) =>
				stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id),
			),
		);
		throw error;
	}

	await Promise.all(
		existing.data
			.filter((taxId) => !kept.has(taxIdKey(taxId)))
			.map((taxId) =>
				stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id),
			),
	);
};

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
		await replaceCustomerTaxIds({
			stripeCli,
			stripeCustomerId,
			taxIds: overrides.tax_ids,
		});
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
