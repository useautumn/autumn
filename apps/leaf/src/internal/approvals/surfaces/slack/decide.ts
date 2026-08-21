import {
	type ChatApproval,
	type ChatApprovalStep,
	chatInstallations,
	checkScopes,
	ms,
} from "@autumn/shared";
import type { ActionEvent } from "chat";
import { differenceInMilliseconds } from "date-fns";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { questionCard } from "../../../../providers/slack/presenters/interactionCards.js";
import { resolveSlackCallerAuth } from "../../../../providers/slack/setup/resolveSlackCallerAuth.js";
import { approvalCard, approvalStatusCard } from "../../../../ui/blocks.js";
import { createThrottledCardEditor } from "../../../../ui/throttledEditor.js";
import { validateSlackAdminAccess } from "../../../slackAdmin/access.js";
import { isInternalAutumnSlackProvider } from "../../../slackAdmin/provider.js";
import { discardApproval } from "../../actions/discardApproval.js";
import { resolveApproval } from "../../actions/resolveApproval.js";
import { withheldStepsOf } from "../../domain/approvalRecord.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../../repos/chatApprovalStepsRepo.js";
import type {
	ApprovalActionDeps,
	ApprovalAuthorization,
	ApprovalCardStatus,
	ApprovalRunResult,
} from "../../types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../utils/approvalErrors.js";
import { formatElapsed } from "../../utils/approvalProgress.js";
import { requiredScopesForApproval } from "../../utils/approvalScopeRequirements.js";
import { publicToolArgs } from "../../utils/toolRequest.js";
import { postApprovalCardForRow } from "./present.js";

const APPROVAL_PROGRESS_DELAY_MS = ms.seconds(10);

/** Grouped writes for card bodies and scope checks; step-listing failures
 * degrade to the legacy marker fallback rather than blocking the click. */
const groupedStepsForApproval = async ({
	approval,
	listSteps = (approvalId) => chatApprovalStepsRepo.list({ approvalId, db }),
}: {
	approval: ChatApproval;
	listSteps?: (approvalId: string) => Promise<ChatApprovalStep[]>;
}) =>
	withheldStepsOf({
		approval,
		steps: await listSteps(approval.id).catch(() => []),
	});

const cardDetailsForApproval = async ({
	approval,
}: {
	approval?: ChatApproval;
}) => ({
	...detailsFromApproval({ approval }),
	groupedSteps: approval
		? await groupedStepsForApproval({ approval })
		: undefined,
});

const detailsFromApproval = ({ approval }: { approval?: ChatApproval }) => ({
	toolName: approval?.tool_name ?? "billing action",
	toolArgs:
		approval?.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: undefined,
	env: approval?.env,
	preview: approval?.preview ?? undefined,
});

const authorizeSlackApprovalClicker = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalAuthorization> => {
	const { toolName } = detailsFromApproval({ approval });

	// Slack-admin approvals are gated upstream by validateSlackAdminAccess.
	if (isInternalAutumnSlackProvider({ provider: approval.provider })) {
		return { allowed: true };
	}

	// A gated tool without a declared scope requirement fails closed.
	const required = requiredScopesForApproval({
		groupedToolNames: (await groupedStepsForApproval({ approval })).map(
			(write) => write.toolName,
		),
		toolArgs: approval.tool_args,
		toolName: approval.tool_name,
	});
	if (!required) {
		rootLogger.warn("Approval tool missing scope requirement", {
			event: "leaf.approval_scope_requirement_missing",
			tool: approval.tool_name,
			data: { org_id: approval.org_id, provider: approval.provider },
		});
		return {
			allowed: false,
			text: `I can't determine the permissions required to approve ${toolName}, so I won't run it.`,
		};
	}

	const installation = await db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.org_id, approval.org_id),
			eq(chatInstallations.provider, approval.provider),
			eq(chatInstallations.workspace_id, approval.workspace_id),
		),
	});
	if (!installation) {
		return {
			allowed: false,
			text: "I couldn't verify your Slack workspace installation, so I can't approve this action.",
		};
	}

	const callerAuth = await resolveSlackCallerAuth({
		installation,
		logger: rootLogger,
		orgId: approval.org_id,
		slackUserId: providerUserId,
	});
	if (!callerAuth.usePerUser) {
		// The session already runs under the installer token; no approver token needed.
		return { allowed: true };
	}

	if (!callerAuth.ok) {
		return { allowed: false, text: callerAuth.text };
	}

	const { allowed, missing } = checkScopes(required, callerAuth.scopes);
	if (!allowed) {
		return {
			allowed: false,
			text: `You don't have permission to approve ${toolName}. Missing: ${missing.join(", ")}.`,
		};
	}

	return { allowed: true };
};

const defaultApprovalActionDeps: ApprovalActionDeps = {
	resolveApproval,
	cancelApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.cancel({ approvalId, db, providerUserId }),
	authorizeApprovalClicker: authorizeSlackApprovalClicker,
	claimApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.claim({ approvalId, db, providerUserId }),
	releaseApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.release({ approvalId, db, providerUserId }),
	editActionMessage: async ({ content, event }) => {
		await event.adapter.editMessage?.(event.threadId, event.messageId, content);
	},
	getApproval: ({ approvalId }) => chatApprovalRepo.get({ approvalId, db }),
	logger: rootLogger,
	postThreadReply: async ({ event, markdown }) => {
		await event.thread?.post({ markdown });
	},
};

/** Every decide-path log line carries the click's identifiers, so approval
 * incidents reconstruct from logs without a DB lookup first. */
const contextualApprovalLogger = ({
	base,
	fields,
}: {
	base: ApprovalActionDeps["logger"];
	fields: Record<string, unknown>;
}): ApprovalActionDeps["logger"] => ({
	error: (...args) => base.error(...args, fields),
	info: (...args) => base.info(...args, fields),
	warn: (...args) => base.warn(...args, fields),
});

// Maps a DB row to the card state shown when a click can no longer act on it.
const cardStatusForApproval = ({
	approval,
}: {
	approval?: ChatApproval;
}): ApprovalCardStatus => {
	const status = approval?.status;
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
	if (status === "pending" && (approval?.expires_at ?? 0) <= Date.now())
		return "expired";
	return "failed";
};

export const handleApprovalActionWithDeps = async ({
	deps: providedDeps = defaultApprovalActionDeps,
	event,
}: {
	deps?: ApprovalActionDeps;
	event: ActionEvent;
}) => {
	const approvalId = event.value;
	if (!approvalId) return;
	const providerUserId = event.user.userId;
	const deps: ApprovalActionDeps = {
		...providedDeps,
		logger: contextualApprovalLogger({
			base: providedDeps.logger,
			fields: {
				approval_id: approvalId,
				provider_user_id: providerUserId,
				slack_message_id: event.messageId,
				slack_thread_id: event.threadId,
			},
		}),
	};

	const editToCurrentStatus = async () => {
		const current = await deps.getApproval({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApproval({ approval: current }),
				...(await cardDetailsForApproval({ approval: current })),
				actorId: current?.decided_by_provider_user_id ?? undefined,
			}),
			event,
		});
	};

	try {
		deps.logger.info("Received approval action", {
			event: "leaf.approval_action_received",
			approval_id: approvalId,
			action: event.actionId,
			data: { provider_user_id: providerUserId },
		});

		const approval = await deps.getApproval({ approvalId });
		if (!approval) {
			await editToCurrentStatus();
			return;
		}
		if (
			approval.provider &&
			isInternalAutumnSlackProvider({ provider: approval.provider })
		) {
			const access = validateSlackAdminAccess({
				workspaceId: approval.workspace_id,
			});
			if (!access.allowed) {
				deps.logger.warn("Slack admin approval action denied", {
					event: "leaf.slack_admin_approval_denied",
					approval_id: approvalId,
					data: { reason: access.reason },
				});
				return;
			}
		}

		if (event.actionId === "cancel_billing_action") {
			// Cancel first so exactly one click wins: the Eve denial below takes
			// seconds, and a second click in that window would otherwise read the
			// row as still pending and discard (and reply) all over again.
			const cancelled = await deps.cancelApproval({
				approvalId,
				providerUserId,
			});
			if (!cancelled) {
				deps.logger.warn("Approval cancellation ignored", {
					event: "leaf.approval_cancel_ignored",
					approval_id: approvalId,
				});
				await editToCurrentStatus();
				return;
			}
			// Eve parks the whole turn on the approval — deny it in the session too,
			// or it keeps waiting, holds the next message behind the stale approval,
			// and the discarded write can still run later.
			if (cancelled.harness === "eve") {
				const discard = deps.discardApproval ?? discardApproval;
				// The row is already cancelled, so a deny eve drops would leave its
				// turn parked behind a card nobody can click — one retry is cheap.
				let denied = await discard({ approval: cancelled, providerUserId });
				if ("error" in denied && denied.error) {
					denied = await discard({ approval: cancelled, providerUserId });
				}
				if ("error" in denied && denied.error) {
					deps.logger.warn("Could not deny Eve approval on dismiss", {
						event: "leaf.eve_dismiss_deny_failed",
						approval_id: approvalId,
						data: { message: denied.message },
					});
				} else if ("text" in denied && denied.text.trim()) {
					try {
						await deps.postThreadReply({ event, markdown: denied.text });
					} catch {
						// The acknowledgement reply is cosmetic.
					}
				}
			}
			await deps.editActionMessage({
				content: approvalStatusCard({
					status: "cancelled",
					...(await cardDetailsForApproval({ approval: cancelled })),
					actorId: providerUserId,
				}),
				event,
			});
			deps.logger.info("Cancelled approval", {
				event: "leaf.approval_cancelled",
				approval_id: approvalId,
				tool: cancelled.tool_name,
			});
			return;
		}

		// Claim first so exactly one click wins; losers never reach authorization.
		const claimed = await deps.claimApproval({ approvalId, providerUserId });
		if (!claimed) {
			deps.logger.warn("Approval claim rejected", {
				event: "leaf.approval_claim_rejected",
				approval_id: approvalId,
			});
			await editToCurrentStatus();
			return;
		}

		// On denial, release the claim so another authorized user can still approve.
		let authorization: ApprovalAuthorization | undefined;
		try {
			authorization = await deps.authorizeApprovalClicker?.({
				approval: claimed,
				providerUserId,
			});
		} catch (error) {
			await deps.releaseApproval?.({ approvalId, providerUserId });
			deps.logger.error("[chat] Approval authorization failed", error, {
				event: "leaf.approval_authorization_failed",
				approval_id: approvalId,
				tool: claimed.tool_name,
				data: { provider_user_id: providerUserId },
			});
			await deps.postThreadReply({
				event,
				markdown:
					"I couldn't verify your Autumn permissions, so I didn't run this action. Please try again.",
			});
			return;
		}
		if (authorization && !authorization.allowed) {
			await deps.releaseApproval?.({ approvalId, providerUserId });
			deps.logger.warn("Approval action denied by Autumn scopes", {
				event: "leaf.approval_scope_denied",
				approval_id: approvalId,
				tool: approval.tool_name,
				data: { provider_user_id: providerUserId },
			});
			await deps.postThreadReply({
				event,
				markdown: authorization.text,
			});
			return;
		}
		const details = await cardDetailsForApproval({ approval: claimed });
		const startedAt = Date.now();
		let statusText: string | undefined;
		const renderRunningCard = () =>
			approvalStatusCard({
				status: "running",
				...details,
				actorId: providerUserId,
				statusLine: statusText
					? differenceInMilliseconds(Date.now(), startedAt) >=
						APPROVAL_PROGRESS_DELAY_MS
						? `${statusText} · ${formatElapsed(startedAt)}`
						: statusText
					: undefined,
			});
		const editor = createThrottledCardEditor({
			edit: () =>
				deps.editActionMessage({ content: renderRunningCard(), event }),
		});
		editor.requestEdit();

		const heartbeat = setInterval(
			() => editor.requestEdit(),
			APPROVAL_PROGRESS_DELAY_MS,
		);
		let result: Awaited<ReturnType<ApprovalActionDeps["resolveApproval"]>>;
		try {
			result = await deps.resolveApproval({
				approval: claimed,
				onResumed: async (resumed) => {
					await surfaceResumedOutcome({ resumed });
				},
				onProgress: (line) => {
					statusText = line;
					editor.requestEdit();
				},
				providerUserId,
			});
		} finally {
			clearInterval(heartbeat);
			await editor.finalize();
		}
		if ("drifted" in result) {
			// Nothing executed; the row is back in pending with fresh previews —
			// re-render the PENDING card and tell the thread why.
			const refreshed = await deps.getApproval({ approvalId });
			if (refreshed) {
				await deps.editActionMessage({
					content: approvalCard({
						id: refreshed.id,
						env: refreshed.env,
						preview: refreshed.preview ?? undefined,
						steps: await groupedStepsForApproval({ approval: refreshed }),
						toolArgs: publicToolArgs(
							refreshed.tool_args as Record<string, unknown>,
						),
						toolName: refreshed.tool_name,
					}),
					event,
				});
			}
			try {
				await deps.postThreadReply({
					event,
					markdown: `:warning: ${result.message}`,
				});
			} catch (error) {
				deps.logger.warn("Could not post drift notice", {
					event: "leaf.approval_drift_notice_failed",
					approval_id: approvalId,
					error,
				});
			}
			deps.logger.info("Completed approval action", {
				event: "leaf.approval_completed",
				approval_id: approvalId,
				status: "drift_refreshed",
				tool: details.toolName,
			});
			return;
		}
		const failed = isErrorResult(result);
		deps.logger.info("Completed approval action", {
			event: "leaf.approval_completed",
			approval_id: approvalId,
			status: failed ? "failed" : "approved",
			tool: details.toolName,
		});

		// The agent's continuation is conversation — it belongs in the thread,
		// while the card stays a compact record of what ran.
		if (!failed && "text" in result && result.text.trim()) {
			try {
				await deps.postThreadReply({ event, markdown: result.text });
			} catch (error) {
				deps.logger.warn("Could not post approval outcome reply", {
					event: "leaf.approval_reply_failed",
					approval_id: approvalId,
					error,
				});
			}
		}
		// The resumed turn can park again (chained write or a question) where
		// nothing streams — surface those as fresh cards or they stay invisible,
		// even when an earlier step failed: the re-issued write is how the user
		// recovers from that failure.
		const surfaceResumedOutcome = async ({
			resumed,
		}: {
			resumed: ApprovalRunResult;
		}) => {
			if (!event.thread) return;
			if ("chainedApprovalId" in resumed && resumed.chainedApprovalId) {
				const chained = await deps.getApproval({
					approvalId: resumed.chainedApprovalId,
				});
				if (chained) {
					await postApprovalCardForRow({
						approval: chained,
						logger: rootLogger,
						target: event.thread,
					});
				}
			}
			if ("question" in resumed && resumed.question) {
				await event.thread.post(
					questionCard({
						env: claimed.env,
						options: resumed.question.options,
						orgId: claimed.org_id,
						prompt: resumed.question.prompt,
						requestId: resumed.question.requestId,
						sessionId: resumed.question.sessionId,
					}),
				);
			}
		};
		if (event.thread) {
			try {
				await surfaceResumedOutcome({ resumed: result });
			} catch (error) {
				deps.logger.warn("Could not surface chained interaction", {
					event: "leaf.approval_chained_surface_failed",
					approval_id: approvalId,
					error,
				});
			}
		}

		await deps.editActionMessage({
			content: approvalStatusCard({
				status: failed ? "failed" : "approved",
				...details,
				actorId: providerUserId,
				result,
				steps: "steps" in result ? result.steps : undefined,
			}),
			event,
		});
	} catch (error) {
		deps.logger.error("[chat] Approval action failed", error, {
			event: "leaf.approval_failed",
			approval_id: approvalId,
			action: event.actionId,
		});
		const current = await deps.getApproval({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApproval({ approval: current }),
				...(await cardDetailsForApproval({ approval: current })),
				result: approvalErrorResult(error),
			}),
			event,
		});
	}
};

/** Positional signature kept for the chat SDK's action-handler callback boundary. */
export const handleApprovalAction = async (event: ActionEvent) =>
	handleApprovalActionWithDeps({ event });
