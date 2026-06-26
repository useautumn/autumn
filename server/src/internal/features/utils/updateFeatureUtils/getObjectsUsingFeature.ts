import type {
	CustomerEntitlement,
	EntitlementWithFeature,
	Feature,
	FullProduct,
	Price,
} from "@autumn/shared";
import { priceOnFeature } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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
	ctx,
	feature,
	products,
}: {
	ctx: AutumnContext;
	feature: Feature;
	// Pre-fetched catalog; skips the listFull when the caller already has it.
	products?: FullProduct[];
}): Promise<ObjectsUsingFeature> => {
	const { db, org, env } = ctx;
	const [allProducts, cusEnts] = await Promise.all([
		products ?? ProductService.listFull({ db, orgId: org.id, env }),
		CusEntService.getByFeature({
			db,
			internalFeatureId: feature.internal_id!,
		}),
	]);

	const allPrices = allProducts.flatMap((p) => p.prices);
	const allEnts = allProducts.flatMap((p) => p.entitlements);
	const creditSystems = getCreditSystemsFromFeature({
		featureId: feature.id,
		features: ctx.features,
	});

	const entitlements = allEnts.filter(
		(entitlement) => entitlement.internal_feature_id === feature.internal_id,
	);
	const linkedEntitlements = allEnts.filter(
		(entitlement) => entitlement.entity_feature_id === feature.id,
	);

	const prices = allPrices.filter((price) =>
		priceOnFeature({ price, feature }),
	);

	return { entitlements, prices, creditSystems, linkedEntitlements, cusEnts };
};
