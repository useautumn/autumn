import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { movesActivePointer } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/licensePlanUtils";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";

/** Mint max+1 when the active row has customers; otherwise skip (follow in place). */
const licenseParentMintIntent = ({
	planId,
	productStatesContext,
	sourceActive,
	newVersionSlug,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
	sourceActive: boolean;
	newVersionSlug?: string;
}): ProductUpsertIntent | undefined => {
	const active = activeFullProductForPlan({ planId, productStatesContext });
	if (!active) return undefined;

	const hasCustomers = productKeyToState({
		productKey: productToProductKey({ product: active }),
		productStatesContext,
	}).customerUsage.hasVersionableCustomerProducts;
	if (!hasCustomers) return undefined;

	const version = maxVersionForPlan({ planId, productStatesContext }) + 1;
	return {
		productKey: { planId, version },
		planParams: {
			plan_id: planId,
			version,
			versioning: "new_version",
			...(sourceActive ? { active: true } : {}),
			...(newVersionSlug ? { new_version_slug: newVersionSlug } : {}),
		},
		source: "license_adopt",
	};
};

/** `propagate.license_parents` `new_version` → mint the parent. Direct claims win. */
export const deriveLicenseParentMintIntents = ({
	intent,
	upsert,
	productStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	const mintedPlanIds = new Set<string>();
	const intents: ProductUpsertIntent[] = [];
	const childTakesActive =
		upsert.row.nextFullProduct.active || movesActivePointer({ upsert });
	if (!childTakesActive) return [];

	for (const target of upsert.propagate?.license_parents ?? []) {
		if (target.versioning !== "new_version") continue;
		if (mintedPlanIds.has(target.plan_id)) continue;

		const mintIntent = licenseParentMintIntent({
			planId: target.plan_id,
			productStatesContext,
			sourceActive: intent.planParams.active === true,
			newVersionSlug: target.new_version_slug,
		});
		if (!mintIntent) continue;

		mintedPlanIds.add(target.plan_id);
		intents.push(mintIntent);
	}

	return intents;
};
