import {
	type CreateBalanceParams,
	type CustomerEntitlement,
	enrichEntitlementWithFeature,
	type Feature,
	type FullCustomer,
	planFeaturesToItems,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initCusEntitlement } from "@/internal/customers/add-product/initCusEnt";
import { initNextResetAt } from "@/internal/customers/cusProducts/insertCusProduct/initCusEnt/initNextResetAt";
import { toFeature } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt";

export const prepareNewBalanceForInsertion = async ({
	ctx,
	fullCustomer,
	feature,
	params,
}: {
	ctx: AutumnContext;
	feature: Feature;
	fullCustomer: FullCustomer;
	params: CreateBalanceParams;
}) => {
	const inputAsItem = planFeaturesToItems({
		features: [feature],
		planFeatures: [params],
	});

	const { ent: newEntitlement } = toFeature({
		item: inputAsItem[0],
		orgId: ctx.org.id,
		isCustom: true,
		internalFeatureId: feature.internal_id!,
	});

	const entity = fullCustomer.entity;

	if (entity) {
		newEntitlement.entity_feature_id = entity.feature_id;
	}

	const newEntitlementWithFeature = enrichEntitlementWithFeature({
		entitlement: newEntitlement,
		feature,
	});

	const newCustomerEntitlement = initCusEntitlement({
		entitlement: newEntitlementWithFeature,
		customer: fullCustomer,
		cusProductId: null,
		freeTrial: null,
		nextResetAt:
			initNextResetAt({
				entitlement: newEntitlementWithFeature,
				now: Date.now(),
			}) ?? Date.now(),
		entities: entity ? [entity] : [],
		carryExistingUsages: false,
		replaceables: [],
		now: Date.now(),
		productOptions: undefined,
		expires_at: params.expires_at ?? null,
	}) satisfies CustomerEntitlement;

	// If entity is provided, assign balance to entity instead of customer-level
	if (entity) {
		newCustomerEntitlement.internal_entity_id = entity.internal_id;
	}

	// Set expiry if provided (mutually exclusive with reset interval)
	if (params.expires_at) {
		newCustomerEntitlement.expires_at = params.expires_at ?? null;
		// Clear next_reset_at since expiring entitlements don't reset
		newCustomerEntitlement.next_reset_at = null;
	}

	return {
		newEntitlement,
		newCustomerEntitlement,
	};
};
