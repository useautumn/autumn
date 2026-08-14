import type {
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";
import { toolRequestFromArgs } from "../../../approvals/utils/toolRequest.js";

const isVersionableChange = (plan: CatalogPlanPreview) =>
	Boolean(plan.customize) ||
	(!!plan.previous_attributes &&
		"billing_controls" in plan.previous_attributes);

const hasHistoricalVersions = (plan: CatalogPlanPreview) =>
	(plan.other_versions?.length ?? 0) > 0;

const planNeedsDecision = (plan: CatalogPlanPreview): boolean =>
	isVersionableChange(plan) &&
	(plan.versionable ||
		hasHistoricalVersions(plan) ||
		(plan.variants?.length ?? 0) > 0);

const isCatalogPreviewShape = (
	value: unknown,
): value is CatalogPreviewUpdateResponse =>
	!!value &&
	typeof value === "object" &&
	Array.isArray((value as { plan_changes?: unknown }).plan_changes);

export const catalogPlanNeedingDecision = (
	preview: unknown,
): CatalogPlanPreview | undefined => {
	if (!isCatalogPreviewShape(preview)) return undefined;
	return preview.plan_changes.find(planNeedsDecision);
};

export const enrichCatalogPreview = async ({
	executeTool,
	input,
	preview,
}: {
	executeTool: (args: {
		args: Record<string, unknown>;
		toolName: string;
	}) => Promise<unknown>;
	input?: Record<string, unknown>;
	preview: unknown;
}): Promise<unknown> => {
	if (!isCatalogPreviewShape(preview)) return preview;
	const request = toolRequestFromArgs(input);
	const plans = Array.isArray(request?.plans)
		? (request.plans as Record<string, unknown>[])
		: undefined;
	if (!plans?.length) return preview;
	const bare = preview.plan_changes.some(
		(plan) =>
			plan.action === "updated" &&
			isVersionableChange(plan) &&
			(plan.variants?.length ?? 0) === 0 &&
			(plan.other_versions?.length ?? 0) === 0,
	);
	if (!bare) return preview;
	try {
		const enriched = await executeTool({
			args: {
				request: {
					...request,
					plans: plans.map((plan) => ({
						...plan,
						include_variants: true,
						include_versions: true,
					})),
				},
			},
			toolName: "previewUpdateCatalog",
		});
		return isCatalogPreviewShape(enriched) ? enriched : preview;
	} catch {
		return preview;
	}
};
