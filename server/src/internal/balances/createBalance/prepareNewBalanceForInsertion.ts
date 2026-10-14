import {
	apiPlanItem,
	type CreateBalanceParamsV0,
	type CustomerEntitlement,
	createBalanceParamsV0ToPlanItemV0,
	type Entitlement,
	enrichEntitlementWithFeature,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isResettingEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateInvoiceCreditBalanceMutationForFeature } from "@/internal/balances/utils/validateInvoiceCreditBalanceMutation.js";
import { initCustomerEntitlement } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlement";
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
	params: CreateBalanceParamsV0;
}): Promise<{
	newEntitlement: Entitlement;
	newCustomerEntitlement: CustomerEntitlement;
}> => {
	validateInvoiceCreditBalanceMutationForFeature({
		customerEntitlements: fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId: feature.id,
		}),
		featureId: feature.id,
	});

	const planItem = createBalanceParamsV0ToPlanItemV0({
		ctx,
		params,
	});

	const inputAsItem = apiPlanItem.map.v0ToProductItem({
		ctx,
		planItem,
	});

	const { ent: newEntitlement } = toFeature({
		item: inputAsItem,
		orgId: ctx.org.id,
		isCustom: true,
		internalFeatureId: feature.internal_id!,
	});

	const entity = fullCustomer.entity;

	const newEntitlementWithFeature = enrichEntitlementWithFeature({
		entitlement: newEntitlement,
		feature,
	});
	const now = Date.now();

	const newCustomerEntitlement = initCustomerEntitlement({
		initContext: {
			fullCustomer,
			featureQuantities: [],
			resetCycleAnchor: now,
			freeTrial: null,
			now,
		},
		entitlement: newEntitlementWithFeature,
		cusProductId: null,
	});

	if (entity) {
		newCustomerEntitlement.internal_entity_id = entity.internal_id;
	}

	if (params.expires_at) {
		newCustomerEntitlement.expires_at = params.expires_at ?? null;
		newCustomerEntitlement.next_reset_at = null;
		newCustomerEntitlement.reset_cycle_anchor = null;
	}

	if (params.next_reset_at !== undefined) {
		newCustomerEntitlement.next_reset_at = params.next_reset_at;
		if (isResettingEntitlement({ entitlement: newEntitlementWithFeature })) {
			newCustomerEntitlement.reset_cycle_anchor = params.next_reset_at;
		}
	}

	if (params.balance_id) {
		newCustomerEntitlement.external_id = params.balance_id;
	}

	return {
		newEntitlement,
		newCustomerEntitlement,
	};
};
