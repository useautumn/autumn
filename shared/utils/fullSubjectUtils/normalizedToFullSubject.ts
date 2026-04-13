import type {
	FullSubject,
	SubjectType,
} from "../../models/cusModels/fullSubject/fullSubjectModel.js";
import type {
	NormalizedFullSubject,
	SubjectBalance,
	SubjectFlag,
} from "../../models/cusModels/fullSubject/normalizedFullSubjectModel.js";
import type { FullAggregatedFeatureBalance } from "../../models/cusProductModels/cusEntModels/aggregatedCusEnt.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Replaceable } from "../../models/cusProductModels/cusEntModels/replaceableTable.js";
import type { FullCustomerPrice } from "../../models/cusProductModels/cusPriceModels/cusPriceModels.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";

const getRolloverSortValue = ({
	rollover,
}: {
	rollover: SubjectBalance["rollovers"][number];
}) => rollover.expires_at ?? Number.POSITIVE_INFINITY;

const subjectBalanceToFullCustomerEntitlement = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): FullCustomerEntitlement => {
	return {
		id: subjectBalance.id,
		internal_customer_id: subjectBalance.internal_customer_id,
		internal_entity_id: subjectBalance.internal_entity_id,
		internal_feature_id: subjectBalance.internal_feature_id,
		feature_id: subjectBalance.feature_id,
		customer_product_id: subjectBalance.customer_product_id,
		entitlement_id: subjectBalance.entitlement_id,
		created_at: subjectBalance.created_at,
		unlimited: subjectBalance.unlimited,
		balance: subjectBalance.balance,
		additional_balance: subjectBalance.additional_balance,
		usage_allowed: subjectBalance.usage_allowed,
		next_reset_at: subjectBalance.next_reset_at,
		adjustment: subjectBalance.adjustment,
		expires_at: subjectBalance.expires_at,
		cache_version: subjectBalance.cache_version ?? 0,
		entities: subjectBalance.entities,
		external_id: subjectBalance.external_id,
		customer_id: subjectBalance.customer_id,
		entitlement: subjectBalance.entitlement,
		replaceables: [] as Replaceable[],
		rollovers: [...subjectBalance.rollovers].sort(
			(left, right) =>
				getRolloverSortValue({ rollover: left }) -
				getRolloverSortValue({ rollover: right }),
		),
	} as FullCustomerEntitlement;
};

const subjectFlagToFullCustomerEntitlement = ({
	subjectFlag,
	fullEntitlement,
}: {
	subjectFlag: SubjectFlag;
	fullEntitlement: FullCustomerEntitlement["entitlement"];
}): FullCustomerEntitlement => {
	return {
		id: subjectFlag.customerEntitlementId,
		internal_customer_id: subjectFlag.internalCustomerId,
		internal_entity_id: subjectFlag.internalEntityId,
		internal_feature_id: subjectFlag.internalFeatureId,
		feature_id: subjectFlag.featureId,
		customer_product_id: subjectFlag.customerProductId,
		entitlement_id: subjectFlag.entitlementId,
		created_at: 0,
		unlimited: null,
		balance: 0,
		additional_balance: 0,
		usage_allowed: null,
		next_reset_at: null,
		adjustment: 0,
		expires_at: subjectFlag.expiresAt,
		cache_version: 0,
		entities: null,
		external_id: subjectFlag.externalId,
		entitlement: fullEntitlement,
		replaceables: [] as Replaceable[],
		rollovers: [],
	} as FullCustomerEntitlement;
};

/**
 * Convert a NormalizedFullSubject (flat arrays) into a FullSubject (nested).
 * Reconstructs boolean CEs from flags + catalog, nests metered CEs into products,
 * and separates extras by null customer_product_id.
 */
export const normalizedToFullSubject = ({
	normalized,
}: {
	normalized: NormalizedFullSubject;
}): FullSubject => {
	const entitlementsById = new Map(
		normalized.entitlements.map(
			(entitlement) => [entitlement.id, entitlement] as const,
		),
	);
	const productsByInternalId = new Map(
		normalized.products.map(
			(product) => [product.internal_id, product] as const,
		),
	);
	const pricesById = new Map(
		normalized.prices.map((price) => [price.id, price] as const),
	);
	const freeTrialsById = new Map(
		normalized.free_trials.map(
			(freeTrial) => [freeTrial.id, freeTrial] as const,
		),
	);

	const customerPricesByCustomerProductId = new Map<
		string,
		FullCustomerPrice[]
	>();
	for (const customerPrice of normalized.customer_prices) {
		if (!customerPrice.customer_product_id) continue;

		const price = customerPrice.price_id
			? pricesById.get(customerPrice.price_id)
			: undefined;
		if (!price) continue;

		const fullCustomerPrice = { ...customerPrice, price } as FullCustomerPrice;
		const existing =
			customerPricesByCustomerProductId.get(
				customerPrice.customer_product_id,
			) ?? [];
		existing.push(fullCustomerPrice);
		customerPricesByCustomerProductId.set(
			customerPrice.customer_product_id,
			existing,
		);
	}

	for (const customerEntitlement of normalized.customer_entitlements) {
		if (!customerEntitlement.customer_product_id) continue;
		if (!customerEntitlement.customerPrice) continue;

		const customerProductId = customerEntitlement.customer_product_id;
		const existing =
			customerPricesByCustomerProductId.get(customerProductId) ?? [];
		if (
			existing.some(
				(customerPrice) =>
					customerPrice.id === customerEntitlement.customerPrice?.id,
			)
		) {
			continue;
		}

		existing.push(customerEntitlement.customerPrice);
		customerPricesByCustomerProductId.set(customerProductId, existing);
	}

	const meteredCesByCustomerProductId = new Map<
		string,
		FullCustomerEntitlement[]
	>();
	const extraMeteredCes: FullCustomerEntitlement[] = [];

	for (const customerEntitlement of normalized.customer_entitlements) {
		const fullCustomerEntitlement = subjectBalanceToFullCustomerEntitlement({
			subjectBalance: customerEntitlement,
		});

		if (!customerEntitlement.customer_product_id) {
			extraMeteredCes.push(fullCustomerEntitlement);
		} else {
			const existing =
				meteredCesByCustomerProductId.get(
					customerEntitlement.customer_product_id,
				) ?? [];
			existing.push(fullCustomerEntitlement);
			meteredCesByCustomerProductId.set(
				customerEntitlement.customer_product_id,
				existing,
			);
		}
	}

	const booleanCesByCustomerProductId = new Map<
		string,
		FullCustomerEntitlement[]
	>();
	const extraBooleanCes: FullCustomerEntitlement[] = [];

	for (const flag of Object.values(normalized.flags)) {
		const entitlement = entitlementsById.get(flag.entitlementId);
		if (!entitlement) continue;

		const fullCustomerEntitlement = subjectFlagToFullCustomerEntitlement({
			subjectFlag: flag,
			fullEntitlement: entitlement,
		});

		if (!flag.customerProductId) {
			extraBooleanCes.push(fullCustomerEntitlement);
		} else {
			const existing =
				booleanCesByCustomerProductId.get(flag.customerProductId) ?? [];
			existing.push(fullCustomerEntitlement);
			booleanCesByCustomerProductId.set(flag.customerProductId, existing);
		}
	}

	const customerProducts: FullCusProduct[] = [];
	for (const customerProduct of normalized.customer_products) {
		const product = productsByInternalId.get(
			customerProduct.internal_product_id,
		);
		if (!product) continue;

		const meteredCes =
			meteredCesByCustomerProductId.get(customerProduct.id) ?? [];
		const booleanCes =
			booleanCesByCustomerProductId.get(customerProduct.id) ?? [];

		customerProducts.push({
			...customerProduct,
			product,
			free_trial: customerProduct.free_trial_id
				? (freeTrialsById.get(customerProduct.free_trial_id) ?? null)
				: null,
			customer_prices:
				customerPricesByCustomerProductId.get(customerProduct.id) ?? [],
			customer_entitlements: [...meteredCes, ...booleanCes],
		} as FullCusProduct);
	}

	const extraCustomerEntitlements = [...extraMeteredCes, ...extraBooleanCes];

	let aggregatedCustomerProducts: FullCusProduct[] | undefined;
	let aggregatedCustomerEntitlements:
		| FullAggregatedFeatureBalance[]
		| undefined;

	if (normalized.entity_aggregations) {
		const entityAgg = normalized.entity_aggregations;

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
				customer_prices: [],
				customer_entitlements: [],
			} as FullCusProduct);
		}

		aggregatedCustomerEntitlements = (
			entityAgg.aggregated_customer_entitlements ?? []
		)
			.map((aggregatedCusEnt) => {
				const feature = normalized.entitlements.find(
					(entitlement) =>
						entitlement.internal_feature_id ===
						aggregatedCusEnt.internal_feature_id,
				)?.feature;
				if (!feature) return null;
				return {
					...aggregatedCusEnt,
					feature,
				} as FullAggregatedFeatureBalance;
			})
			.filter((e): e is FullAggregatedFeatureBalance => e !== null);
	}

	return {
		subjectType: normalized.subjectType as SubjectType,
		customerId: normalized.customerId,
		internalCustomerId: normalized.internalCustomerId,
		...(normalized.entity
			? {
					entityId: normalized.entityId,
					internalEntityId: normalized.internalEntityId,
					entity: normalized.entity,
				}
			: {}),
		customer: normalized.customer,
		customer_products: customerProducts,
		extra_customer_entitlements: extraCustomerEntitlements,
		subscriptions: normalized.subscriptions ?? [],
		invoices: normalized.invoices ?? [],
		...(aggregatedCustomerProducts
			? { aggregated_customer_products: aggregatedCustomerProducts }
			: {}),
		...(aggregatedCustomerEntitlements
			? { aggregated_customer_entitlements: aggregatedCustomerEntitlements }
			: {}),
	} as FullSubject;
};
