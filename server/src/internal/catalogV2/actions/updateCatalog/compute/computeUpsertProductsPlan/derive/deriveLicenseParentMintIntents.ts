import { productToProductKey } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";

/** Mint max+1 when the active row has customers; otherwise skip (follow in place). */
const licenseParentMintIntent = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
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
		},
		source: "license_adopt",
	};
};

/** `propagate.license_parents` `new_version` → mint the parent. Direct claims win. */
export const deriveLicenseParentMintIntents = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	const mintedPlanIds = new Set<string>();
	const intents: ProductUpsertIntent[] = [];

	for (const target of upsert.propagate?.license_parents ?? []) {
		if (target.versioning !== "new_version") continue;
		if (mintedPlanIds.has(target.plan_id)) continue;

		const mintIntent = licenseParentMintIntent({
			planId: target.plan_id,
			productStatesContext,
		});
		if (!mintIntent) continue;

		mintedPlanIds.add(target.plan_id);
		intents.push(mintIntent);
	}

	return intents;
};
