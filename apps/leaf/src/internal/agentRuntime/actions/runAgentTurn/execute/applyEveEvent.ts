import { parsePreviewPayload } from "@autumn/render";
import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import { toolRequestFromArgs } from "../../../../approvals/utils/toolRequest.js";
import { executeAutumnMcpTool } from "../../../../autumnMcp/client.js";
import type { AgentActionProgress } from "../../../domain/agentTurnContext.js";
import type { EveEvent } from "../../../eve/eveEventSchemas.js";
import { isPreviewToolName } from "../../../eve/events.js";
import type { CapturedPreview } from "../../../eve/parkedWritePreview.js";
import { deleteEveSession } from "../../../eve/repo.js";
import { saveEveSessionState } from "../../../eve/sessionState.js";
import type { EveSessionRef } from "../../../eve/types.js";
import { normalizeToolName } from "../../../tools/toolPolicy.js";
import { enrichCatalogPreview } from "../../resolveCatalogDecision/catalogDecisionPolicy.js";
import {
	type EveTurnEffect,
	type EveTurnProgress,
	type EveTurnTransition,
	reduceEveTurnEvent,
} from "./eveTurnReducer.js";

type EveEventType = EveEvent["type"];
type EveEventOf<T extends EveEventType> = Extract<EveEvent, { type: T }>;

export type EveEventContext<T extends EveEventType = EveEventType> = {
	env: AppEnv;
	event: EveEventOf<T>;
	onAction?: (progress: AgentActionProgress | string) => Promise<void> | void;
	onReasoning?: (input: { id: string; text: string }) => void;
	onThinking?: () => void;
	orgId: string;
	progress: EveTurnProgress;
	session: EveSessionRef;
	token: string;
};

const capturePreviewResult = async ({
	env,
	event,
	progress,
	token,
}: Pick<
	EveEventContext<"action.result">,
	"env" | "event" | "progress" | "token"
>): Promise<CapturedPreview | undefined> => {
	const result = event.result;
	if (
		!result?.toolName ||
		!isPreviewToolName(result.toolName) ||
		event.status !== "completed"
	) {
		return undefined;
	}
	const input = result.callId
		? progress.toolInputs.get(result.callId)
		: undefined;
	return {
		preview: await enrichCatalogPreview({
			executeTool: (call) => executeAutumnMcpTool({ env, token, ...call }),
			input,
			preview: parsePreviewPayload(result.output) ?? result.output,
		}),
		previewTool: normalizeToolName(result.toolName),
		request: toolRequestFromArgs(input),
	};
};

const applyEveEffect = async ({
	effect,
	onAction,
	onReasoning,
	onThinking,
	orgId,
	session,
}: Omit<EveEventContext, "env" | "event" | "progress" | "token"> & {
	effect: EveTurnEffect;
}) => {
	switch (effect.kind) {
		case "action":
			await onAction?.(effect.progress);
			return;
		case "delete_session":
			await deleteEveSession({
				db,
				env: session.env,
				orgId,
				reason: "session_failed",
				sessionId: session.sessionId,
				threadKey: session.threadKey,
			});
			return;
		case "reasoning":
			onReasoning?.({ id: effect.id, text: effect.text });
			return;
		case "thinking":
			onThinking?.();
			return;
		case "save_session":
			if (effect.pendingRequests?.length) {
				logger.info("Recorded eve parks the session is waiting on", {
					event: "leaf.eve_pending_requests_recorded",
					data: {
						request_ids: effect.pendingRequests.map(
							(request) => request.requestId,
						),
						session_id: session.sessionId,
					},
				});
			}
			await saveEveSessionState({
				orgId,
				session,
				state: effect.pendingRequests
					? { pendingRequests: [...effect.pendingRequests] }
					: undefined,
			});
			return;
		case "throw":
			throw new Error(effect.message);
	}
};

export const applyEveEvent = async (
	context: EveEventContext,
): Promise<EveTurnTransition> => {
	const capturedPreview =
		context.event.type === "action.result"
			? await capturePreviewResult({ ...context, event: context.event })
			: undefined;
	const transition = reduceEveTurnEvent({
		capturedPreview,
		event: context.event,
		progress: context.progress,
	});
	for (const effect of transition.effects) {
		await applyEveEffect({ ...context, effect });
	}
	return transition;
};
