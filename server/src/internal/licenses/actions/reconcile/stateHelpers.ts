import type { DbPlanLicense, FullCusProduct } from "@autumn/shared";
import type { CustomerLicenseState } from "./types.js";

/** The (parent, license) pool composite key, defined once so reconcile, list,
 * and balance lookups never build it two different ways. */
export const poolKey = (
	parentCustomerProductId: string | null | undefined,
	licenseInternalProductId: string,
) => `${parentCustomerProductId ?? ""}:${licenseInternalProductId}`;

/** Each parent × its live (non-tombstone) license definitions — the "offered
 * pools" every consumer iterates. */
export function* offeredPools({
	parents,
	definitionsByParentId,
}: Pick<CustomerLicenseState, "parents" | "definitionsByParentId">): Generator<{
	parent: FullCusProduct;
	definition: DbPlanLicense;
}> {
	for (const parent of parents) {
		for (const definition of definitionsByParentId.get(parent.id) ?? []) {
			if (definition.included <= 0) continue;
			yield { parent, definition };
		}
	}
}
