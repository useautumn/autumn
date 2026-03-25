import type { FullCustomer } from "../../../models/cusModels/fullCusModel.js";

/** Logs a compact summary of a FullCustomer without flooding the terminal. */
export const logFullCustomer = ({
	fullCustomer,
}: {
	fullCustomer: FullCustomer;
}) => {
	const summarizeProduct = (cp: FullCustomer["customer_products"][number]) => ({
		id: cp.id,
		product_id: cp.product_id,
		status: cp.status,
		internal_entity_id: cp.internal_entity_id ?? null,
		customer_entitlements: cp.customer_entitlements.length,
		customer_prices: cp.customer_prices.length,
	});

	const summarizeCusEnt = (
		ce: FullCustomer["extra_customer_entitlements"][number],
	) => ({
		id: ce.id,
		feature_id: ce.entitlement?.feature?.id,
		balance: ce.balance,
		unlimited: ce.unlimited,
	});

	const summarizeAggregatedEnt = (
		ae: NonNullable<FullCustomer["aggregated_customer_entitlements"]>[number],
	) => ({
		feature_id: ae.feature_id,
		balance: ae.balance,
		adjustment: ae.adjustment,
		unlimited: ae.unlimited,
		entity_count: ae.entity_count,
		entitlement:
			"entitlement" in ae
				? (ae as Record<string, unknown>).entitlement
					? "yes"
					: "no"
				: "no",
	});

	const summary = {
		customer: {
			id: fullCustomer.id,
			internal_id: fullCustomer.internal_id,
			name: fullCustomer.name,
			email: fullCustomer.email,
		},
		customer_products: fullCustomer.customer_products.map(summarizeProduct),
		extra_customer_entitlements:
			fullCustomer.extra_customer_entitlements.map(summarizeCusEnt),
		entities: `${fullCustomer.entities?.length ?? 0} entities`,
		aggregated_customer_products:
			fullCustomer.aggregated_customer_products?.map(summarizeProduct) ?? "N/A",
		aggregated_customer_entitlements:
			fullCustomer.aggregated_customer_entitlements?.map(
				summarizeAggregatedEnt,
			) ?? "N/A",
		aggregated_customer_prices: `${fullCustomer.aggregated_customer_prices?.length ?? "N/A"} prices`,
	};

	console.log(JSON.stringify(summary, null, 2));
};
