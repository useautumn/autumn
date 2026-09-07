import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

const parentsAnchoredTo = ({
	childInternalId,
	updateCatalogPlan,
}: {
	childInternalId: string;
	updateCatalogPlan: UpdateCatalogPlan;
}): string[] => [
	...new Set(
		updateCatalogPlan.projected.products.flatMap((parent) =>
			(parent.licenses ?? [])
				.filter(
					(link) =>
						!link.is_custom &&
						link.license_internal_product_id === childInternalId,
				)
				.map((link) => parent.id),
		),
	),
];

/** Parents this same call declares a link to the child plan on. */
const parentsDeclaringLink = ({
	childPlanId,
	updateCatalogPlan,
}: {
	childPlanId: string;
	updateCatalogPlan: UpdateCatalogPlan;
}): string[] => [
	...new Set(
		updateCatalogPlan.upsertProducts
			.filter((upsert) =>
				(upsert.declaredLicenses ?? []).some(
					(license) => license.license_plan_id === childPlanId,
				),
			)
			.map((upsert) => upsert.row.planId),
	),
];

/**
 * Block archive/remove of a child version that catalog links still point at.
 * Named parents come from the projected catalog (same-call unlinks are gone),
 * plus parents whose declared licenses[] still name a plan removed outright.
 */
export const handleLicenseAnchorLifecycleErrors = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): void => {
	const retiring = [
		...updateCatalogPlan.removePlans.flatMap((removePlan) =>
			removePlan.current
				? [
						{
							planId: removePlan.planId,
							version: removePlan.version,
							internalId: removePlan.current.internal_id,
							wholePlan: removePlan.allVersions === true,
						},
					]
				: [],
		),
		...updateCatalogPlan.upsertProducts.flatMap((upsert) => {
			const { currentFullProduct, nextFullProduct } = upsert.row;
			if (!nextFullProduct.archived || currentFullProduct?.archived) return [];
			return [
				{
					planId: upsert.row.planId,
					version: upsert.row.version,
					internalId: nextFullProduct.internal_id,
					wholePlan: false,
				},
			];
		}),
	];

	for (const row of retiring) {
		const parentIds = [
			...new Set([
				...parentsAnchoredTo({
					childInternalId: row.internalId,
					updateCatalogPlan,
				}),
				...(row.wholePlan
					? parentsDeclaringLink({
							childPlanId: row.planId,
							updateCatalogPlan,
						})
					: []),
			]),
		];
		if (parentIds.length === 0) continue;
		throw new RecaseError({
			message: `Cannot archive or remove ${row.planId} version ${row.version} while ${parentIds.join(", ")} still ${parentIds.length === 1 ? "links" : "link"} to it`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
