import type { FeatureOptions } from "@autumn/shared";
import {
	type Customer,
	type DbCustomerEntitlement,
	type DbCustomerPrice,
	type DbFreeTrial,
	type DbPrice,
	type DbProduct,
	type DbRollover,
	type EntitlementWithFeature,
	type Entity,
	type EntityAggregations,
	FeatureType,
	type FullCustomerPrice,
	type FullSubject,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type SubjectBalance,
	type SubjectFlag,
	type SubjectQueryRow,
	type SubjectType,
} from "@autumn/shared";

/**
 * Convert raw DB query row into NormalizedFullSubject.
 * Partitions boolean CEs into flags and builds self-contained SubjectBalance
 * objects for metered entitlements.
 */
export const subjectQueryRowToNormalized = ({
	row,
}: {
	row: SubjectQueryRow;
}): NormalizedFullSubject => {
	const customer = row.customer as unknown as Customer;
	const entity = row.entity as Entity | undefined;
	const isEntitySubject = !!entity;

	const entitlementsByEntitlementId = new Map(
		row.entitlements.map((e) => [e.id, e] as const),
	);

	const flags: Record<string, SubjectFlag> = {};
	const meteredCustomerEntitlements: SubjectBalance[] = [];

	const rolloversByCusEntId = new Map<string, DbRollover[]>();
	for (const rollover of row.rollovers) {
		const existing = rolloversByCusEntId.get(rollover.cus_ent_id) ?? [];
		existing.push(rollover);
		rolloversByCusEntId.set(rollover.cus_ent_id, existing);
	}

	const customerProductsById = new Map(
		row.customer_products.map(
			(customerProduct) => [customerProduct.id, customerProduct] as const,
		),
	);

	const pricesById = new Map(
		row.prices.map((price) => [price.id, price] as const),
	);

	const resolveCustomerPrice = ({
		customerEntitlement,
		entitlement,
	}: {
		customerEntitlement: DbCustomerEntitlement;
		entitlement: EntitlementWithFeature;
	}): FullCustomerPrice | null => {
		if (!customerEntitlement.customer_product_id) return null;

		const customerPrice = row.customer_prices.find(
			(candidate: DbCustomerPrice) => {
				if (
					candidate.customer_product_id !==
					customerEntitlement.customer_product_id
				) {
					return false;
				}

				if (!candidate.price_id) return false;
				const price = pricesById.get(candidate.price_id);
				return price?.entitlement_id === entitlement.id;
			},
		);

		if (!customerPrice?.price_id) return null;
		const price = pricesById.get(customerPrice.price_id);
		if (!price) return null;

		return {
			...customerPrice,
			price,
		} as FullCustomerPrice;
	};

	const resolveCustomerProductOptions = ({
		customerEntitlement,
		entitlement,
	}: {
		customerEntitlement: DbCustomerEntitlement;
		entitlement: EntitlementWithFeature;
	}): FeatureOptions | null => {
		if (!customerEntitlement.customer_product_id) return null;
		const customerProduct = customerProductsById.get(
			customerEntitlement.customer_product_id,
		);
		if (!customerProduct) return null;

		const options = customerProduct.options as FeatureOptions[] | null;
		if (!options) return null;

		return (
			options.find(
				(option) =>
					option.internal_feature_id === entitlement.internal_feature_id ||
					option.feature_id === entitlement.feature.id,
			) ?? null
		);
	};

	const partitionCustomerEntitlement = (
		customerEntitlement: DbCustomerEntitlement,
	) => {
		const catalogEntitlement = entitlementsByEntitlementId.get(
			customerEntitlement.entitlement_id,
		);
		if (!catalogEntitlement) return;

		if (catalogEntitlement.feature.type === FeatureType.Boolean) {
			flags[catalogEntitlement.feature.id] = {
				featureId: catalogEntitlement.feature.id,
				internalFeatureId: customerEntitlement.internal_feature_id,
				entitlementId: catalogEntitlement.id,
				customerEntitlementId: customerEntitlement.id,
				customerProductId: customerEntitlement.customer_product_id,
				internalCustomerId: customerEntitlement.internal_customer_id,
				internalEntityId: customerEntitlement.internal_entity_id,
				expiresAt: customerEntitlement.expires_at,
				externalId: customerEntitlement.external_id,
			};
		} else {
			const customerProduct = customerEntitlement.customer_product_id
				? customerProductsById.get(customerEntitlement.customer_product_id)
				: undefined;

			meteredCustomerEntitlements.push({
				...customerEntitlement,
				internal_feature_id: catalogEntitlement.internal_feature_id,
				feature_id: catalogEntitlement.feature.id,
				balance: customerEntitlement.balance ?? 0,
				adjustment: customerEntitlement.adjustment ?? 0,
				additional_balance: customerEntitlement.additional_balance ?? 0,
				cache_version: customerEntitlement.cache_version ?? 0,
				entities: customerEntitlement.entities ?? null,
				entitlement: catalogEntitlement as EntitlementWithFeature,
				rollovers: rolloversByCusEntId.get(customerEntitlement.id) ?? [],
				customerPrice: resolveCustomerPrice({
					customerEntitlement,
					entitlement: catalogEntitlement as EntitlementWithFeature,
				}),
				customerProductOptions: resolveCustomerProductOptions({
					customerEntitlement,
					entitlement: catalogEntitlement as EntitlementWithFeature,
				}),
				customerProductQuantity: customerProduct?.quantity ?? 1,
			});
		}
	};

	for (const customerEntitlement of row.customer_entitlements) {
		partitionCustomerEntitlement(customerEntitlement);
	}
	for (const customerEntitlement of row.extra_customer_entitlements) {
		partitionCustomerEntitlement(customerEntitlement);
	}

	let entityAggregations: EntityAggregations | undefined;
	if (row.entity_aggregations) {
		entityAggregations = {
			aggregated_customer_products:
				row.entity_aggregations.aggregated_customer_products,
			aggregated_customer_entitlements:
				row.entity_aggregations.aggregated_customer_entitlements,
		};
	}

	return {
		subjectType: (isEntitySubject ? "entity" : "customer") as SubjectType,
		customerId: customer.id ?? customer.internal_id,
		internalCustomerId: customer.internal_id,
		...(entity
			? {
					entityId: entity.id ?? entity.internal_id,
					internalEntityId: entity.internal_id,
					entity,
				}
			: {}),
		customer,
		customer_products: row.customer_products,
		customer_entitlements: meteredCustomerEntitlements,
		customer_prices: row.customer_prices,
		flags,
		products: row.products as DbProduct[],
		entitlements: row.entitlements as EntitlementWithFeature[],
		prices: row.prices as DbPrice[],
		free_trials: row.free_trials as DbFreeTrial[],
		subscriptions: row.subscriptions ?? [],
		invoices: row.invoices ?? [],
		entity_aggregations: entityAggregations,
	};
};

/** Convert raw DB query row to FullSubject via NormalizedFullSubject. */
export const resultToFullSubject = ({
	row,
}: {
	row: SubjectQueryRow;
}): FullSubject => {
	const normalized = subjectQueryRowToNormalized({ row });
	return normalizedToFullSubject({ normalized });
};
