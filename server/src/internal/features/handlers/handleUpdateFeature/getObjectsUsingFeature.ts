import type {
	AppEnv,
	CustomerEntitlement,
	EntitlementWithFeature,
	Feature,
	Price,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getCreditSystemsFromFeature } from "../../creditSystemUtils.js";

export type ObjectsUsingFeature = {
	entitlements: EntitlementWithFeature[];
	prices: Price[];
	creditSystems: Feature[];
	linkedEntitlements: EntitlementWithFeature[];
	cusEnts: CustomerEntitlement[];
};

export const getObjectsUsingFeature = async ({
	db,
	orgId,
	env,
	allFeatures,
	feature,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	allFeatures: Feature[];
	feature: Feature;
}): Promise<ObjectsUsingFeature> => {
	const [products, cusEnts] = await Promise.all([
		ProductService.listFull({
			db,
			orgId,
			env,
		}),
		CusEntService.getByFeature({
			db,
			internalFeatureId: feature.internal_id!,
		}),
	]);

	const allPrices = products.flatMap((p) => p.prices);
	const allEnts = products.flatMap((p) => p.entitlements);
	const creditSystems = getCreditSystemsFromFeature({
		featureId: feature.id,
		features: allFeatures,
	});

	const entitlements = allEnts.filter(
		(entitlement) => entitlement.internal_feature_id === feature.internal_id,
	);
	const linkedEntitlements = allEnts.filter(
		(entitlement) => entitlement.entity_feature_id === feature.id,
	);

	const prices = allPrices.filter(
		(price) =>
			(price.config as any).internal_feature_id === feature.internal_id,
	);

	return { entitlements, prices, creditSystems, linkedEntitlements, cusEnts };
};
