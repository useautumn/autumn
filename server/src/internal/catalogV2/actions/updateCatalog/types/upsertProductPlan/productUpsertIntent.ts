import {
	type ProductKey,
	productKeyToString,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductSource } from "./upsertProductPlan";

/** planParams with version always set (explicit pin or resolved latest/v1). */
export type ResolvedPlanParams = UpdateCatalogPlanParams & { version: number };

/**
 * Pending work on one productKey — before computeUpsertProductPlan folds it
 * into an UpsertProductPlan.
 */
export type ProductUpsertIntent = {
	productKey: ProductKey;
	planParams: ResolvedPlanParams;
	source: UpsertProductSource;
};

export const claimProductKeys = ({
	intents,
}: {
	intents: ProductUpsertIntent[];
}): Set<string> =>
	new Set(
		intents.map((intent) =>
			productKeyToString({ productKey: intent.productKey }),
		),
	);

/** First claim wins: drops intents already claimed, claims the rest. */
export const claimNewIntents = ({
	intents,
	claimedProductKeys,
}: {
	intents: ProductUpsertIntent[];
	claimedProductKeys: Set<string>;
}): ProductUpsertIntent[] =>
	intents.filter((intent) => {
		const key = productKeyToString({ productKey: intent.productKey });
		if (claimedProductKeys.has(key)) return false;
		claimedProductKeys.add(key);
		return true;
	});
