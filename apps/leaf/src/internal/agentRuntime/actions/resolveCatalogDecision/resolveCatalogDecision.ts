import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { parsePreviewPayload } from "../../../../ui/previewContent.js";
import { fetchApprovalPreview } from "../../../approvals/utils/fetchApprovalPreview.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../../approvals/utils/toolRequest.js";
import type { AgentApprovalRequest } from "../../domain/agentTurn.js";
import type { AgentThreadRef } from "../../domain/agentTurnContext.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../eve/client.js";
import { siblingRequestIdsFromToolArgs } from "../../eve/parkedInput.js";
import { getEveSessionBySessionId, upsertEveSession } from "../../eve/repo.js";
import type { EveAuthContext } from "../../eve/types.js";
import { normalizeToolName } from "../../tools/toolPolicy.js";
import { catalogPlanNeedingDecision } from "./catalogDecisionPolicy.js";

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

const requestFromSuspension = (suspension: AgentApprovalRequest) =>
	toolRequestFromArgs(publicToolArgs(suspension.toolArgs)) ?? {};

export const resolveCatalogDecision = async ({
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
	suspension: AgentApprovalRequest;
	thread: AgentThreadRef;
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
			siblingRequestIds: siblingRequestIdsFromToolArgs(suspension.toolArgs),
		});
		adoptPostedEveSession({ posted, session, status: "waiting" });
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
