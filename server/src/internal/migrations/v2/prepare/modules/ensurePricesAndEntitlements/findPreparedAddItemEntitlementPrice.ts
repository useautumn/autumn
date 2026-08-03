import type { Entitlement, Price } from "@autumn/shared";
import type { CreatePlanItemParamsV1Input } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import { hashPlanItemArtifact } from "./hashPlanItemArtifact.js";
import type { EnsurePricesAndEntitlementsResult } from "./types.js";

export type PreparedAddItemEntitlementPrice = {
	entitlement?: Entitlement;
	price?: Price;
};

/** Follows the artifact address this module writes — (op_index, "add_item",
 * item_index, product, item hash) — to the entitlement/price rows it created. */
export const findPreparedAddItemEntitlementPrice = ({
	prepared,
	opIndex,
	itemIndex,
	internalProductId,
	item,
}: {
	prepared: EnsurePricesAndEntitlementsResult;
	opIndex: number;
	itemIndex: number;
	internalProductId: string;
	item: CreatePlanItemParamsV1Input;
}): PreparedAddItemEntitlementPrice | undefined => {
	const hash = hashPlanItemArtifact({ item });
	const artifact = prepared.artifacts.find(
		(candidate) =>
			candidate.op_index === opIndex &&
			candidate.kind === "add_item" &&
			candidate.item_index === itemIndex &&
			candidate.internal_product_id === internalProductId &&
			candidate.hash === hash,
	);
	if (!artifact) return undefined;

	return {
		entitlement: prepared.entitlements.find(
			(entitlement) => entitlement.id === artifact.entitlement_id,
		),
		price: prepared.prices.find((price) => price.id === artifact.price_id),
	};
};
