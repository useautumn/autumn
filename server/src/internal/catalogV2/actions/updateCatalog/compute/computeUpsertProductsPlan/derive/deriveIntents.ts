import { deriveLicenseParentIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveLicenseParentIntents";
import { deriveVariantIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVariantIntents";
import { deriveVersionSiblingIntents } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/derive/deriveVersionSiblingIntents";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	claimNewIntents,
	type ProductUpsertIntent,
	type UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/**
 * Intents implied by a just-folded row. Each edge decides its own policy;
 * first claim wins so derived work never overrides earlier intents.
 */
export const deriveIntents = ({
	intent,
	upsert,
	projectedProductStatesContext,
	claimedProductKeys,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
	claimedProductKeys: Set<string>;
}): ProductUpsertIntent[] =>
	claimNewIntents({
		intents: [
			...deriveVersionSiblingIntents({
				intent,
				projectedProductStatesContext,
			}),
			...deriveVariantIntents({
				intent,
				upsert,
				projectedProductStatesContext,
			}),
			...deriveLicenseParentIntents({
				intent,
				upsert,
				projectedProductStatesContext,
			}),
		],
		claimedProductKeys,
	});
