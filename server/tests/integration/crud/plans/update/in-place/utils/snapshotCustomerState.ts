import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";

/**
 * Stable JSON view of a customer's billing state for byte-for-byte before/after
 * comparison. Excludes timestamps / surrogate ids that churn on any write and
 * keeps only what proves an existing customer's plan was left untouched.
 */
export const snapshotCustomerState = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const products = fullCustomer.customer_products
		.map((cusProduct) => ({
			product_id: cusProduct.product_id,
			status: cusProduct.status,
			entity_id: cusProduct.entity_id ?? null,
			trial_ends_at: cusProduct.trial_ends_at ?? null,
			canceled_at: cusProduct.canceled_at ?? null,
			scheduled_ids: [...(cusProduct.scheduled_ids ?? [])].sort(),
			options: cusProduct.options,
			entitlements: cusProduct.customer_entitlements
				.map((cusEnt) => ({
					entitlement_id: cusEnt.entitlement_id,
					balance: cusEnt.balance ?? null,
					unlimited: cusEnt.unlimited ?? null,
					next_reset_at: cusEnt.next_reset_at ?? null,
					entities: cusEnt.entities ?? null,
				}))
				.sort((a, b) => a.entitlement_id.localeCompare(b.entitlement_id)),
			prices: cusProduct.customer_prices
				.map((cusPrice) => ({ price_id: cusPrice.price_id }))
				.sort((a, b) => (a.price_id ?? "").localeCompare(b.price_id ?? "")),
		}))
		.sort(
			(a, b) =>
				a.product_id.localeCompare(b.product_id) ||
				(a.entity_id ?? "").localeCompare(b.entity_id ?? ""),
		);

	return JSON.stringify(products);
};
