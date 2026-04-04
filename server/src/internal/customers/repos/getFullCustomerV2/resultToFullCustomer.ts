import type {
	CustomerPrice,
	DbPrice,
	DbRollover,
	Entity,
	FullAggregatedCustomerEntitlement,
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	FullCustomerPrice,
	Invoice,
	Replaceable,
	Subscription,
} from "@autumn/shared";
import type { SubjectCoreRow } from "../getFullSubject.js";

const getRolloverSortValue = ({ rollover }: { rollover: DbRollover }) =>
	rollover.expires_at ?? Number.POSITIVE_INFINITY;

const buildFullCustomerEntitlement = ({
	customerEntitlement,
	entitlement,
	rollovers,
}: {
	customerEntitlement: SubjectCoreRow["customer_entitlements"][number];
	entitlement: SubjectCoreRow["entitlements"][number] | undefined;
	rollovers: DbRollover[];
}): FullCustomerEntitlement | null => {
	if (!entitlement) return null;

	return {
		...customerEntitlement,
		entitlement,
		replaceables: [] as Replaceable[],
		rollovers: [...rollovers].sort(
			(left, right) =>
				getRolloverSortValue({ rollover: left }) -
				getRolloverSortValue({ rollover: right }),
		),
	} as FullCustomerEntitlement;
};

const buildFullCustomerPrice = ({
	customerPrice,
	price,
}: {
	customerPrice: SubjectCoreRow["customer_prices"][number];
	price: DbPrice | undefined;
}): FullCustomerPrice | null => {
	if (!price) return null;

	return {
		...customerPrice,
		price,
	} as FullCustomerPrice;
};

export const resultToFullCustomer = ({
	row,
	entities = [],
	invoices,
	subscriptions,
}: {
	row: SubjectCoreRow;
	entities?: Entity[];
	invoices?: Invoice[];
	subscriptions?: Subscription[];
}): FullCustomer => {
	const productsByInternalId = new Map(
		row.products.map((product) => [product.internal_id, product] as const),
	);
	const entitlementsById = new Map(
		row.entitlements.map(
			(entitlement) => [entitlement.id, entitlement] as const,
		),
	);
	const pricesById = new Map(
		row.prices.map((price) => [price.id, price] as const),
	);
	const freeTrialsById = new Map(
		row.free_trials.map((freeTrial) => [freeTrial.id, freeTrial] as const),
	);

	const rolloversByCustomerEntitlementId = new Map<string, DbRollover[]>();
	for (const rollover of row.rollovers) {
		const existingRollovers =
			rolloversByCustomerEntitlementId.get(rollover.cus_ent_id) ?? [];
		existingRollovers.push(rollover);
		rolloversByCustomerEntitlementId.set(
			rollover.cus_ent_id,
			existingRollovers,
		);
	}

	const customerPricesByCustomerProductId = new Map<
		string,
		FullCustomerPrice[]
	>();
	for (const customerPrice of row.customer_prices) {
		if (!customerPrice.customer_product_id) continue;

		const fullCustomerPrice = buildFullCustomerPrice({
			customerPrice,
			price: customerPrice.price_id
				? pricesById.get(customerPrice.price_id)
				: undefined,
		});

		if (!fullCustomerPrice) continue;

		const existingCustomerPrices =
			customerPricesByCustomerProductId.get(
				customerPrice.customer_product_id,
			) ?? [];
		existingCustomerPrices.push(fullCustomerPrice);
		customerPricesByCustomerProductId.set(
			customerPrice.customer_product_id,
			existingCustomerPrices,
		);
	}

	const customerEntitlementsByCustomerProductId = new Map<
		string,
		FullCustomerEntitlement[]
	>();
	for (const customerEntitlement of row.customer_entitlements) {
		if (!customerEntitlement.customer_product_id) continue;

		const fullCustomerEntitlement = buildFullCustomerEntitlement({
			customerEntitlement,
			entitlement: entitlementsById.get(customerEntitlement.entitlement_id),
			rollovers:
				rolloversByCustomerEntitlementId.get(customerEntitlement.id) ?? [],
		});

		if (!fullCustomerEntitlement) continue;

		const existingCustomerEntitlements =
			customerEntitlementsByCustomerProductId.get(
				customerEntitlement.customer_product_id,
			) ?? [];
		existingCustomerEntitlements.push(fullCustomerEntitlement);
		customerEntitlementsByCustomerProductId.set(
			customerEntitlement.customer_product_id,
			existingCustomerEntitlements,
		);
	}

	const customerProducts: FullCusProduct[] = [];
	for (const customerProduct of row.customer_products) {
		const product = productsByInternalId.get(
			customerProduct.internal_product_id,
		);
		if (!product) continue;

		customerProducts.push({
			...customerProduct,
			product,
			free_trial: customerProduct.free_trial_id
				? (freeTrialsById.get(customerProduct.free_trial_id) ?? null)
				: null,
			customer_prices:
				customerPricesByCustomerProductId.get(customerProduct.id) ?? [],
			customer_entitlements:
				customerEntitlementsByCustomerProductId.get(customerProduct.id) ?? [],
		} as FullCusProduct);
	}

	const extraCustomerEntitlements = row.extra_customer_entitlements
		.map((customerEntitlement) =>
			buildFullCustomerEntitlement({
				customerEntitlement,
				entitlement: entitlementsById.get(customerEntitlement.entitlement_id),
				rollovers:
					rolloversByCustomerEntitlementId.get(customerEntitlement.id) ?? [],
			}),
		)
		.filter(
			(customerEntitlement): customerEntitlement is FullCustomerEntitlement =>
				customerEntitlement !== null,
		);

	let aggregatedCustomerProducts: FullCusProduct[] | undefined;
	let aggregatedCustomerEntitlements:
		| FullAggregatedCustomerEntitlement[]
		| undefined;
	let aggregatedCustomerPrices: CustomerPrice[] | undefined;

	if (row.entity_aggregations) {
		const entityAgg = row.entity_aggregations;

		const entityCusPricesByProductId = new Map<string, FullCustomerPrice[]>();
		for (const entityCusPrice of entityAgg.aggregated_customer_prices) {
			if (!entityCusPrice.customer_product_id) continue;

			const fullPrice = buildFullCustomerPrice({
				customerPrice: entityCusPrice,
				price: entityCusPrice.price_id
					? pricesById.get(entityCusPrice.price_id)
					: undefined,
			});
			if (!fullPrice) continue;

			const existing =
				entityCusPricesByProductId.get(entityCusPrice.customer_product_id) ??
				[];
			existing.push(fullPrice);
			entityCusPricesByProductId.set(
				entityCusPrice.customer_product_id,
				existing,
			);
		}

		aggregatedCustomerProducts = [];
		for (const entityCusProduct of entityAgg.aggregated_customer_products) {
			const product = productsByInternalId.get(
				entityCusProduct.internal_product_id,
			);
			if (!product) continue;

			aggregatedCustomerProducts.push({
				...entityCusProduct,
				product,
				free_trial: entityCusProduct.free_trial_id
					? (freeTrialsById.get(entityCusProduct.free_trial_id) ?? null)
					: null,
				customer_prices:
					entityCusPricesByProductId.get(entityCusProduct.id) ?? [],
				customer_entitlements: [],
			} as FullCusProduct);
		}

		aggregatedCustomerEntitlements = (
			entityAgg.aggregated_customer_entitlements ?? []
		)
			.map((aggregatedCusEnt) => {
				const entitlement = row.entitlements.find(
					(e) => e.internal_feature_id === aggregatedCusEnt.internal_feature_id,
				);
				if (!entitlement) return null;
				return {
					...aggregatedCusEnt,
					entitlement,
				} as FullAggregatedCustomerEntitlement;
			})
			.filter((e): e is FullAggregatedCustomerEntitlement => e !== null);
	}

	return {
		...row.customer,
		customer_products: customerProducts,
		extra_customer_entitlements: extraCustomerEntitlements,
		entities,
		...(invoices ? { invoices } : {}),
		...(subscriptions ? { subscriptions } : {}),
		...(aggregatedCustomerProducts
			? { aggregated_customer_products: aggregatedCustomerProducts }
			: {}),
		...(aggregatedCustomerEntitlements
			? { aggregated_customer_entitlements: aggregatedCustomerEntitlements }
			: {}),
		...(aggregatedCustomerPrices
			? { aggregated_customer_prices: aggregatedCustomerPrices }
			: {}),
	} as FullCustomer;
};
