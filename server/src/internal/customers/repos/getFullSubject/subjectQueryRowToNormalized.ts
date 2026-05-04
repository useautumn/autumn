import type { FeatureOptions } from "@autumn/shared";
import {
	type AggregatedFeatureBalance,
	type AggregatedSubjectFlag,
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
	InternalError,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type Replaceable,
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
	entityIdRequested = false,
	allowMissingEntity = false,
}: {
	row: SubjectQueryRow;
	entityIdRequested?: boolean;
	allowMissingEntity?: boolean;
}): NormalizedFullSubject => {
	const customer = row.customer as unknown as Customer;
	const entity = row.entity as Entity | undefined;
	const isEntitySubject = !!entity;

	if (entityIdRequested && !entity && !allowMissingEntity) {
		throw new InternalError({
			message:
				"subjectQueryRowToNormalized received a row with no entity when an entityId was requested and allowMissingEntity is false",
			code: "subject_row_missing_entity",
		});
	}

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
	const replaceablesByCusEntId = new Map<string, Replaceable[]>();
	for (const replaceable of row.replaceables) {
		const existing = replaceablesByCusEntId.get(replaceable.cus_ent_id) ?? [];
		existing.push(replaceable);
		replaceablesByCusEntId.set(replaceable.cus_ent_id, existing);
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

			const isEntityLevel = !!(
				customerEntitlement.internal_entity_id ||
				customerProduct?.internal_entity_id
			);

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
				replaceables: replaceablesByCusEntId.get(customerEntitlement.id) ?? [],
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
				isEntityLevel,
			});
		}
	};

	for (const customerEntitlement of row.customer_entitlements) {
		partitionCustomerEntitlement(customerEntitlement);
	}
	for (const customerEntitlement of row.extra_customer_entitlements) {
		partitionCustomerEntitlement(customerEntitlement);
	}

	// Split the SQL aggregate output by feature type:
	//   - non-boolean rows → aggregated_customer_entitlements (metered totals)
	//   - boolean rows     → aggregated_subject_flags (identity-only)
	// This is the single choke point for keeping booleans out of the cache
	// writer's per-feature `_aggregated` hashes.
	let entityAggregations: EntityAggregations | undefined;
	if (row.entity_aggregations) {
		const featuresByInternalId = new Map(
			row.entitlements.map(
				(entitlement) =>
					[entitlement.feature.internal_id, entitlement.feature] as const,
			),
		);

		const aggregatedMetered: AggregatedFeatureBalance[] = [];
		const aggregatedSubjectFlags: Record<string, AggregatedSubjectFlag> = {};

		for (const aggregated of row.entity_aggregations
			.aggregated_customer_entitlements) {
			const feature = featuresByInternalId.get(aggregated.internal_feature_id);
			if (feature?.type === FeatureType.Boolean) {
				aggregatedSubjectFlags[aggregated.feature_id] = {
					feature_id: aggregated.feature_id,
					internal_feature_id: aggregated.internal_feature_id,
					internal_customer_id: aggregated.internal_customer_id,
					api_id: aggregated.api_id,
				};
			} else {
				aggregatedMetered.push(aggregated);
			}
		}

		entityAggregations = {
			aggregated_customer_products:
				row.entity_aggregations.aggregated_customer_products,
			aggregated_customer_entitlements: aggregatedMetered,
			aggregated_subject_flags: aggregatedSubjectFlags,
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
	entityIdRequested = false,
	allowMissingEntity = false,
}: {
	row: SubjectQueryRow;
	entityIdRequested?: boolean;
	allowMissingEntity?: boolean;
}): FullSubject => {
	const normalized = subjectQueryRowToNormalized({
		row,
		entityIdRequested,
		allowMissingEntity,
	});
	return normalizedToFullSubject({ normalized });
};
