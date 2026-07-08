import type { AutumnLogger } from "@autumn/logging";
import type {
	AppEnv,
	CatalogPlanPreview,
	CatalogPreviewUpdateResponse,
} from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import { normalizeToolName } from "../../agent/tools/toolPolicy.js";
import { fetchApprovalPreview } from "../../internal/approvals/utils/fetchApprovalPreview.js";
import { db } from "../../lib/db.js";
import type { Suspension } from "../../types.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import { postEveInputResponse } from "./client.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext } from "./types.js";

const isVersionableChange = (plan: CatalogPlanPreview) =>
	Boolean(plan.customize) ||
	(!!plan.previous_attributes &&
		"billing_controls" in plan.previous_attributes);

const hasHistoricalVersions = (plan: CatalogPlanPreview) =>
	(plan.other_versions?.length ?? 0) > 0;

/** Whether this previewed plan change needs a versioning/variant/migration
 * decision before `updateCatalog` should run. Mirrors
 * `vite/src/views/chat/components/CatalogDecisionCard.tsx`'s `planNeedsDecision`
 * — kept in sync by hand since the two run in different apps/runtimes. */
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

/** The first plan in a `previewUpdateCatalog` result that needs a decision, or
 * undefined if the preview doesn't need one (or isn't a catalog preview). */
export const catalogPlanNeedingDecision = (
	preview: unknown,
): CatalogPlanPreview | undefined => {
	if (!isCatalogPreviewShape(preview)) return undefined;
	return preview.plan_changes.find(planNeedsDecision);
};

/** The server only returns variant/version previews when asked per plan, and
 * the model often previews without the flags — silently hiding the decisions.
 * When an updated plan came back bare, re-preview with the flags forced. */
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
	const request =
		input && typeof input.request === "object"
			? (input.request as Record<string, unknown>)
			: input;
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

const hasExplicitVersioning = (request: Record<string, unknown>) => {
	if (request.migration) return true;
	const plans = Array.isArray(request.plans)
		? (request.plans as Record<string, unknown>[])
		: [];
	return plans.some(
		(plan) =>
			plan.disable_version !== undefined ||
			plan.all_versions !== undefined ||
			plan.update_variant_ids !== undefined ||
			plan.migration !== undefined,
	);
};

const requestFromSuspension = (suspension: Suspension) => {
	const {
		_eveApproveOptionId: _approve,
		_eveDenyOptionId: _deny,
		...rest
	} = suspension.toolArgs;
	return rest.request && typeof rest.request === "object"
		? (rest.request as Record<string, unknown>)
		: rest;
};

/** The one chokepoint the model can't skip: an `updateCatalog` suspension.
 * When the (flag-forced) preview shows the plan needs versioning/variant/
 * migration decisions and none were given, deny the parked call and hand the
 * decision to the dashboard instead of rendering an approval card. */
export const redirectCatalogSuspensionToDecision = async ({
	decisionProvided,
	env,
	logger,
	orgId,
	providerUserId,
	runId,
	suspension,
	thread,
	token,
}: {
	decisionProvided: boolean;
	env: AppEnv;
	logger: AutumnLogger;
	orgId: string;
	providerUserId: string;
	runId?: string;
	suspension: Suspension;
	thread: ThreadRef;
	token: string;
}): Promise<CatalogPlanPreview | undefined> => {
	if (normalizeToolName(suspension.toolName) !== "updateCatalog") {
		return undefined;
	}
	if (decisionProvided) return undefined;
	const request = requestFromSuspension(suspension);
	if (hasExplicitVersioning(request)) return undefined;

	const preview = await fetchApprovalPreview({
		env,
		logger,
		request,
		token,
		toolName: "updateCatalog",
	});
	const plan = catalogPlanNeedingDecision(
		parsePreviewPayload(preview) ?? preview,
	);
	if (!plan) return undefined;

	if (!(runId && suspension.toolCallId)) return undefined;
	const session = await getEveSessionBySessionId({
		db,
		orgId,
		sessionId: runId,
	});
	if (!session) return undefined;
	try {
		const denyOptionId =
			typeof suspension.toolArgs._eveDenyOptionId === "string"
				? suspension.toolArgs._eveDenyOptionId
				: "deny";
		const posted = await postEveInputResponse({
			note: "(Dashboard: this change needs versioning/variant/migration choices — a decision card is already shown to the user with explanatory text. Do NOT reply; end your turn silently and wait for their selection.)",
			auth: {
				appEnv: env,
				channelId: thread.channelId,
				orgId,
				provider: thread.provider,
				providerUserId,
				threadId: thread.threadId,
				workspaceId: thread.workspaceId,
			} satisfies EveAuthContext,
			optionId: denyOptionId,
			requestId: suspension.toolCallId,
			session,
		});
		session.sessionId = posted.sessionId;
		session.state.continuationToken = posted.continuationToken;
		session.state.status = "waiting";
		await upsertEveSession({
			db,
			env: session.env,
			orgId,
			sessionId: session.sessionId,
			state: session.state,
			threadKey: session.threadKey,
		});
	} catch (error) {
		logger.warn("Could not deny updateCatalog pending decision", {
			event: "leaf.eve_catalog_decision_deny_failed",
			data: { error: error instanceof Error ? error.message : String(error) },
		});
		return undefined;
	}
	return plan;
};
