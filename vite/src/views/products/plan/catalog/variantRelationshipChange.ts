import type { UpdateCatalogPlanParamsInput } from "@autumn/shared";

type VariantVersionRow = { version: number };

/**
 * What the base-plan picker asked for, resolved against every version the
 * variant plan has. The server treats a variant plan as one family, so a
 * link, reparent or unlink must name every version or it is rejected.
 */
export type VariantRelationshipChange =
	| { kind: "unchanged" }
	| {
			kind: "link";
			basePlanId: string;
			baseVersion: number;
			variantVersions: VariantVersionRow[];
	  }
	| { kind: "unlink"; variantVersions: VariantVersionRow[] };

export const resolveVariantRelationshipChange = ({
	editedBasePlanId,
	persistedBasePlanId,
	selectedBaseVersion,
	variantVersions,
}: {
	/** Undefined until the picker moves; null means detach. */
	editedBasePlanId: string | null | undefined;
	persistedBasePlanId: string | null;
	selectedBaseVersion: number | undefined;
	/** Every existing version of the edited plan; undefined while still loading. */
	variantVersions: VariantVersionRow[] | undefined;
}): VariantRelationshipChange => {
	const nextBasePlanId =
		editedBasePlanId === undefined ? persistedBasePlanId : editedBasePlanId;
	if (nextBasePlanId === persistedBasePlanId) return { kind: "unchanged" };
	if (variantVersions === undefined || variantVersions.length === 0) {
		throw new Error("Variant versions are still loading; try again");
	}
	if (nextBasePlanId === null) return { kind: "unlink", variantVersions };
	if (selectedBaseVersion === undefined) {
		throw new Error(`Base plan ${nextBasePlanId} has no version to link to`);
	}
	return {
		kind: "link",
		basePlanId: nextBasePlanId,
		baseVersion: selectedBaseVersion,
		variantVersions,
	};
};

/** The catalog rows that carry a relationship change; none when unchanged. */
export const variantRelationshipPlanParams = ({
	variantPlanId,
	change,
}: {
	variantPlanId: string;
	change: VariantRelationshipChange;
}): UpdateCatalogPlanParamsInput[] => {
	if (change.kind === "unchanged") return [];
	if (change.kind === "unlink") {
		return change.variantVersions.map(({ version }) => ({
			plan_id: variantPlanId,
			version,
			base_variant_id: null,
		}));
	}
	return [
		{
			plan_id: change.basePlanId,
			version: change.baseVersion,
			variants: change.variantVersions.map(({ version }) => ({
				variant_plan_id: variantPlanId,
				version,
			})),
		},
	];
};
