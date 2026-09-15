import { ErrCode, RecaseError, type UpdateCatalogParams } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** The plan id each stated row of a family would carry after this update. */
const statedIdsByFamily = ({
	params,
	internalIdRefs,
}: {
	params: UpdateCatalogParams;
	internalIdRefs: InternalIdRefs;
}): Map<string, Map<string, string>> => {
	const byFamily = new Map<string, Map<string, string>>();
	for (const planParams of params.plans ?? []) {
		if (!planParams.internal_id) continue;
		const ref = internalIdRefs.get(planParams.internal_id);
		if (!ref) continue;
		const rows = byFamily.get(ref.planId) ?? new Map();
		rows.set(
			planParams.internal_id,
			planParams.new_plan_id ?? planParams.plan_id,
		);
		byFamily.set(ref.planId, rows);
	}
	return byFamily;
};

/**
 * A plan id is a family name: every version carries it, and a rename moves
 * them all. One stated row leaving for a new id while any sibling — stated or
 * not — keeps the old one would split the family, which no write can express.
 */
export const handlePlanFamilyErrors = ({
	params,
	internalIdRefs,
	productStatesContext,
}: {
	params: UpdateCatalogParams;
	internalIdRefs: InternalIdRefs;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const [familyId, statedRows] of statedIdsByFamily({
		params,
		internalIdRefs,
	})) {
		const renamedTo = [...statedRows.values()].find((id) => id !== familyId);
		if (renamedTo === undefined) continue;

		const familyRows = productStatesContext.versionsByPlanId[familyId] ?? [];
		const leftBehind = familyRows.some(
			(row) =>
				!row.archived &&
				(statedRows.get(row.internal_id) ?? familyId) !== renamedTo,
		);
		if (!leftBehind) continue;

		throw new RecaseError({
			message: `All versions of ${familyId} must keep one plan id. Rename every version to ${renamedTo}, or none.`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
