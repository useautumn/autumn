import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import {
	catalogRowIdentity,
	defaultVersionSlug,
} from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { buildPlanUsage } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import { formatPlanUsageMessages } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/formatPlanUsageMessages";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

type PlanPreview = PreviewUpdateCatalogResponse["plans"][number];

/** Unpinned `plan_id` → one group; pinned version → its own group. */
const groupRemovePlans = ({
	removePlans,
}: {
	removePlans: RemovePlanPlan[];
}): RemovePlanPlan[][] => {
	const groups = new Map<string, RemovePlanPlan[]>();
	for (const row of removePlans) {
		const key = row.allVersions
			? `${row.planId}:all`
			: `${row.planId}:${row.version}`;
		const current = groups.get(key) ?? [];
		current.push(row);
		groups.set(key, current);
	}
	return [...groups.values()];
};

const buildRemovePlanPreview = ({
	rows,
	catalogContext,
}: {
	rows: RemovePlanPlan[];
	catalogContext: UpdateCatalogContext;
}): PlanPreview | null => {
	const first = rows[0];
	if (!first) return null;
	const willArchive = rows.some((row) => row.willArchive);
	const hasCustomers = rows.some((row) => row.hasCustomers);
	const usage = buildPlanUsage({
		rows,
		previewContext: catalogContext.previewContext,
		productStatesContext: catalogContext.productStatesContext,
	});
	const name = first.current?.name ?? first.planId;
	const current = first.current;
	return {
		...catalogRowIdentity({
			planId: first.planId,
			version: first.version,
			current,
			next: current ?? {
				id: first.planId,
				version_slug: defaultVersionSlug({ version: first.version }),
				active: false,
			},
		}),
		name,
		action: "delete",
		state: {
			has_customers: hasCustomers,
			will_archive: willArchive,
			usage,
			reasons: formatPlanUsageMessages({
				usage,
				willArchive,
				planName: name,
				scope: first.allVersions ? "plan" : "version",
			}),
		},
		versioning: null,
	};
};

/** One preview row per remove group (unpinned plan, or a pinned version). */
export const buildRemovePlansPreview = ({
	removePlans,
	catalogContext,
}: {
	removePlans: RemovePlanPlan[];
	catalogContext: UpdateCatalogContext;
}): PlanPreview[] =>
	groupRemovePlans({ removePlans }).flatMap((rows) => {
		const preview = buildRemovePlanPreview({ rows, catalogContext });
		return preview ? [preview] : [];
	});
