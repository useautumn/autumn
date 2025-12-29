import {
	type CreateBalanceSchema,
	type CustomerEntitlement,
	type Feature,
	type FullCustomer,
	planFeaturesToItems,
	type ResetInterval,
} from "@shared/index";
import type z from "zod/v4";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initCusEntitlement } from "@/internal/customers/add-product/initCusEnt";
import { initNextResetAt } from "@/internal/customers/cusProducts/insertCusProduct/initCusEnt/initNextResetAt";
import { toFeature } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt";

export const prepareNewBalanceForInsertion = async ({
	ctx,
	feature,
	granted_balance,
	unlimited,
	reset,
	fullCus,
	feature_id,
}: {
	ctx: AutumnContext;
	feature: Feature;
	granted_balance: number | undefined;
	unlimited: boolean | undefined;
	reset: z.infer<typeof CreateBalanceSchema>["reset"];
	fullCus: FullCustomer;
	feature_id: string;
}) => {
	const inputAsItem = planFeaturesToItems({
		features: [feature],
		planFeatures: [
			{
				feature_id,
				granted_balance: granted_balance,
				unlimited,
				reset: reset
					? {
							interval: reset.interval as ResetInterval,
							interval_count: reset.interval_count,
							reset_when_enabled: true,
						}
					: undefined,
			},
		],
	});

	const { ent: newEntitlement } = toFeature({
		item: inputAsItem[0],
		orgId: ctx.org.id,
		isCustom: true,
		internalFeatureId: feature.internal_id!,
	});

	const newEntitlementWithFeature = {
		...newEntitlement,
		feature,
		feature_id: feature.id,
	};

	const newCustomerEntitlement = initCusEntitlement({
		entitlement: newEntitlementWithFeature,
		customer: fullCus,
		cusProductId: null,
		freeTrial: null,
		nextResetAt:
			initNextResetAt({
				entitlement: newEntitlementWithFeature,
				now: Date.now(),
			}) ?? Date.now(),
		entities: [],
		carryExistingUsages: false,
		replaceables: [],
		now: Date.now(),
		productOptions: undefined,
	}) satisfies CustomerEntitlement;

	return {
		newEntitlement,
		newCustomerEntitlement,
	};
};
