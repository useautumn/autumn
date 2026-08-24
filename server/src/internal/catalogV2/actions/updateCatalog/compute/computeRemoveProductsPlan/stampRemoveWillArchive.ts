import type { FullProduct } from "@autumn/shared";
import type { ProjectedCatalog } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import type { RemovePlanTarget } from "./resolveRemoveProductTargets";

const rowKey = ({
	planId,
	version,
}: {
	planId: string;
	version: number;
}): string => `${planId}:${version}`;

const shareUnpinnedVerdict = ({
	rows,
}: {
	rows: RemovePlanPlan[];
}): RemovePlanPlan[] => {
	const archiveAllVersions = new Set(
		rows
			.filter((row) => row.allVersions && row.willArchive)
			.map((row) => row.planId),
	);
	return rows.map((row) =>
		row.allVersions && archiveAllVersions.has(row.planId)
			? { ...row, willArchive: true }
			: row,
	);
};

const pass1FromCustomersAndRewards = ({
	targets,
	catalogContext,
}: {
	targets: RemovePlanTarget[];
	catalogContext: UpdateCatalogContext;
}): RemovePlanPlan[] => {
	const { productStatesContext } = catalogContext;
	return shareUnpinnedVerdict({
		rows: targets.map((target) => {
			if (!target.current) {
				return {
					...target,
					willArchive: false,
					willTombstone: false,
					hasCustomers: false,
				};
			}
			const { customerUsage } = productKeyToState({
				productKey: {
					planId: target.planId,
					version: target.version,
				},
				productStatesContext,
			});
			const hasCustomers = customerUsage.hasAnyCustomerProducts;
			const hasVersionableCustomers =
				customerUsage.hasVersionableCustomerProducts;
			const hasExpiredOnlyCustomers =
				hasCustomers && !hasVersionableCustomers;
			const hasRewards =
				(productStatesContext.rewardProgramsByPlanId[target.planId] ?? [])
					.length > 0;
			const isWholePlan = target.allVersions;
			const isLiveVersion = target.current.active;
			const pinBlocksLive = !isWholePlan && isLiveVersion;
			const willTombstone =
				hasExpiredOnlyCustomers && !hasRewards && !pinBlocksLive;
			return {
				...target,
				hasCustomers,
				willTombstone,
				willArchive: !willTombstone && (hasCustomers || hasRewards),
			};
		}),
	});
};

const parentStillOffersChild = ({
	parent,
	childPlanId,
}: {
	parent: FullProduct;
	childPlanId: string;
}): boolean =>
	(parent.licenses ?? []).some(
		(license) => license.product.id === childPlanId,
	);

const pass2FromSurvivingLicenseParents = ({
	rows,
	projected,
}: {
	rows: RemovePlanPlan[];
	projected: ProjectedCatalog;
}): RemovePlanPlan[] => {
	const hardDeletedKeys = new Set(
		rows
			.filter(
				(row) => row.current && !row.willArchive && !row.willTombstone,
			)
			.map((row) => rowKey({ planId: row.planId, version: row.version })),
	);

	return shareUnpinnedVerdict({
		rows: rows.map((row) => {
			if (!row.current || row.willArchive) return row;
			const hasSurvivingParent = projected.products.some((parent) => {
				if (
					hardDeletedKeys.has(
						rowKey({ planId: parent.id, version: parent.version }),
					)
				) {
					return false;
				}
				return parentStillOffersChild({
					parent,
					childPlanId: row.planId,
				});
			});
			return hasSurvivingParent
				? { ...row, willArchive: true, willTombstone: false }
				: row;
		}),
	});
};

/** Pass 1: customers + rewards. Pass 2: license parents that remain. */
export const stampRemoveWillArchive = ({
	targets,
	catalogContext,
	projected,
}: {
	targets: RemovePlanTarget[];
	catalogContext: UpdateCatalogContext;
	projected: ProjectedCatalog;
}): RemovePlanPlan[] =>
	pass2FromSurvivingLicenseParents({
		rows: pass1FromCustomersAndRewards({ targets, catalogContext }),
		projected,
	});
