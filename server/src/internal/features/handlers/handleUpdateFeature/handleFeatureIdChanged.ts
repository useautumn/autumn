import {
	type Entitlement,
	ErrCode,
	type Feature,
	type Price,
	RecaseError,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { FeatureService } from "../../FeatureService.js";

export const handleFeatureIdChanged = async ({
	ctx,
	feature,
	linkedEntitlements,
	entitlements,
	prices,
	creditSystems,
	newId,
}: {
	ctx: AutumnContext;
	feature: Feature;
	linkedEntitlements: Entitlement[];
	entitlements: Entitlement[];
	prices: Price[];
	creditSystems: Feature[];
	newId: string;
}) => {
	const { db, org, env } = ctx;

	// 1. Check if any customer entitlement linked to this feature
	const cusEnts = await CusEntService.getByFeature({
		db,
		internalFeatureId: feature.internal_id,
	});

	if (cusEnts.length > 0) {
		throw new RecaseError({
			message: `Cannot change id of feature ${feature.id} because a customer is using it`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// 2. Update all linked objects
	const batchUpdate = [];

	for (const entitlement of linkedEntitlements) {
		batchUpdate.push(
			EntitlementService.update({
				db,
				id: entitlement.id!,
				updates: {
					entity_feature_id: newId,
				},
			}),
		);
	}

	await Promise.all(batchUpdate);

	// 3. Update all linked prices
	const priceUpdate = [];
	for (const price of prices) {
		priceUpdate.push(
			PriceService.update({
				db,
				id: price.id!,
				update: {
					config: {
						...price.config,
						feature_id: newId,
					} as UsagePriceConfig,
				},
			}),
		);
	}

	await Promise.all(priceUpdate);

	// 4. Update all linked credit systems
	const creditSystemUpdate = [];
	for (const creditSystem of creditSystems) {
		const newSchema = structuredClone(creditSystem.config.schema);
		for (let i = 0; i < newSchema.length; i++) {
			if (newSchema[i].metered_feature_id === feature.id) {
				newSchema[i].metered_feature_id = newId;
			}
		}
		creditSystemUpdate.push(
			FeatureService.update({
				db,
				id: creditSystem.id!,
				orgId: org.id,
				env,
				updates: {
					config: {
						...creditSystem.config,
						schema: newSchema,
					},
				},
			}),
		);
	}

	await Promise.all(creditSystemUpdate);

	// 5. Update all linked entitlements
	const entitlementUpdate = [];

	for (const entitlement of entitlements) {
		entitlementUpdate.push(
			EntitlementService.update({
				db,
				id: entitlement.id!,
				updates: {
					feature_id: newId,
				},
			}),
		);
	}

	await Promise.all(entitlementUpdate);
};
