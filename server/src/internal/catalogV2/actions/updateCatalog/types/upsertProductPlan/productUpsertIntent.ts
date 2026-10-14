import {
	type DiffedCustomizePlanV1,
	type ProductKey,
	productKeyToString,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import type { UpsertProductSource } from "./upsertProductPlan";

export type ResolvedPlanParams = UpdateCatalogPlanParams & { version: number };

export type ProductUpsertIntent = {
	productKey: ProductKey;
	planParams: ResolvedPlanParams;
	source: UpsertProductSource;
	editDiff?: DiffedCustomizePlanV1;
	baseInternalProductId?: string | null;
	unlink?: boolean;
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
