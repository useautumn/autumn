import { useChat } from "@ai-sdk/react";
import type { PromptInputMessage } from "@autumn/ui/ai-elements";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { useEnv } from "@/utils/envUtils";
import type {
	ApprovalStatus,
	DecidingState,
	LeafApproval,
	LeafCatalogDecision,
	LeafQuestionResponse,
	LeafUIMessage,
} from "../chatTypes";
import { unwrapRequestParams } from "../chatTypes";
import { useDecideApprovalMutation } from "./useDecideApprovalMutation";
import { useLeafInteractionsQuery } from "./useLeafInteractionsQuery";
import { useLeafThreadQuery } from "./useLeafThreadQuery";

export type {
	ApprovalStatus,
	LeafApprovalData,
	LeafStepData,
	LeafUIMessage,
} from "../chatTypes";

const BACKEND = import.meta.env.VITE_BACKEND_URL;

const approvalIdsIn = (messages: LeafUIMessage[]): Set<string> => {
	const ids = new Set<string>();
	for (const message of messages) {
		for (const part of message.parts) {
			if (part.type === "data-approval") ids.add(part.data.approvalId);
		}
	}
	return ids;
};

const versioningLabel: Record<LeafCatalogDecision["versioning"], string> = {
	create_version: "Create a new version",
	update_all_versions: "Update all versions",
	update_current: "Update the current version",
};

/** Human-readable summary sent as the message text alongside the structured
 * `catalogDecision` metadata, so the transcript reads naturally too. */
const decisionSummaryText = (decision: LeafCatalogDecision): string => {
	const parts = [
		`Apply the change now: ${versioningLabel[decision.versioning].toLowerCase()}`,
	];
	if (decision.propagateVariantIds.length > 0) {
		parts.push(`propagate to ${decision.propagateVariantIds.join(", ")}`);
	} else {
		parts.push("don't propagate to variants");
	}
	parts.push(
		decision.migrationDraft ? "create a migration draft" : "no migration draft",
	);
	return `${parts.join("; ")}.`;
};

const approvalMessage = (approval: LeafApproval): LeafUIMessage => ({
	id: `approval-${approval.id}`,
	parts: [
		{
			data: {
				approvalId: approval.id,
				params: unwrapRequestParams(approval.tool_args),
				preview: approval.preview,
				status: "pending",
				toolName: approval.tool_name,
			},
			id: approval.id,
			type: "data-approval",
		},
	],
	role: "assistant",
});

/**
 * Chat with the Leaf agent, brokered through the main server (cookie auth) to
 * Leaf's web adapter. The text stream carries assistant prose; structured plan
 * previews + approvals are fetched beside the stream (TanStack Query) and
 * spliced in as native `data-approval` message parts, resolved in place.
 */
export function useLeafChat({
	onFirstMessage,
	shouldHydrate,
	threadId,
}: {
	onFirstMessage?: () => void;
	shouldHydrate: boolean;
	threadId: string;
}) {
	const [input, setInput] = useState("");
	const [hydrationDone, setHydrationDone] = useState(!shouldHydrate);
	const env = useEnv();

	const { error, messages, sendMessage, status, setMessages, stop } =
		useChat<LeafUIMessage>({
			id: threadId,
			transport: new DefaultChatTransport({
				api: `${BACKEND}/agent/chat`,
				credentials: "include",
				// Forward the dashboard's active env so leaf scopes the CMA session +
				// vault/OAuth credential to sandbox vs live (axios sends this on the
				// other chat calls; the stream transport must too).
				headers: { "x-client-type": "dashboard", app_env: env },
			}),
		});

	const isLoading = status === "streaming" || status === "submitted";

	// Hydrate history once, while the live store is still empty.
	const { messages: hydratedMessages } = useLeafThreadQuery({
		enabled: shouldHydrate,
		threadId,
	});
	useEffect(() => {
		if (hydratedMessages && !hydrationDone) {
			// Hydrated history (incl. historical approval cards) is authoritative on
			// load — replace, don't merge, so the interactions poll can't pre-empt it.
			setMessages(hydratedMessages);
			setHydrationDone(true);
		}
	}, [hydratedMessages, hydrationDone, setMessages]);

	// A turn that suspended on a destructive write records an approval; pick it up
	// once the stream settles (and after hydration, so it can't block history).
	const { approvals, refetchInteractions } = useLeafInteractionsQuery({
		threadId,
	});
	useEffect(() => {
		if (status === "ready" && hydrationDone) void refetchInteractions();
	}, [status, hydrationDone, refetchInteractions]);
	useEffect(() => {
		if (!approvals) return;
		const pendingIds = new Set(approvals.map((approval) => approval.id));
		setMessages((prev) => {
			const present = approvalIdsIn(prev);
			const fresh = approvals.filter((approval) => !present.has(approval.id));
			// A pending card the server no longer lists was superseded (the user
			// moved on and the agent auto-discarded it) — resolve it in place so
			// stale Apply/Discard buttons never linger.
			const swept = prev.map((message) => ({
				...message,
				parts: message.parts.map((part) =>
					part.type === "data-approval" &&
					part.data.status === "pending" &&
					!pendingIds.has(part.data.approvalId)
						? { ...part, data: { ...part.data, status: "rejected" as const } }
						: part,
				),
			}));
			return fresh.length === 0
				? swept
				: [...swept, ...fresh.map(approvalMessage)];
		});
	}, [approvals, setMessages]);

	const setApprovalStatus = useCallback(
		(approvalId: string, next: ApprovalStatus) => {
			setMessages((prev) =>
				prev.map((message) => ({
					...message,
					parts: message.parts.map((part) =>
						part.type === "data-approval" && part.data.approvalId === approvalId
							? { ...part, data: { ...part.data, status: next } }
							: part,
					),
				})),
			);
		},
		[setMessages],
	);

	const appendAssistant = useCallback(
		(text: string) => {
			setMessages((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					parts: [{ text, type: "text" }],
					role: "assistant",
				},
			]);
		},
		[setMessages],
	);

	const { decide } = useDecideApprovalMutation();
	const [deciding, setDeciding] = useState<DecidingState>(null);
	const resolveApproval = useCallback(
		async (action: "approve" | "reject", approvalId: string) => {
			const verb = action === "approve" ? "apply" : "discard";
			setDeciding({ action, approvalId });
			try {
				const data = await decide({ action, approvalId });
				if (data.error) {
					appendAssistant(`Couldn't ${verb} the changes: ${data.error}`);
					return;
				}
				// Resolve in place only after the write actually succeeds.
				setApprovalStatus(
					approvalId,
					action === "approve" ? "approved" : "rejected",
				);
				if (action === "approve") {
					appendAssistant(data.text?.trim() || "Applied.");
				} else if (data.text?.trim()) {
					// The agent's reaction to the discard (eve denies the parked call
					// and the turn finishes with a message).
					appendAssistant(data.text.trim());
				}
				void refetchInteractions();
			} catch {
				appendAssistant(`Couldn't ${verb} the changes. Please try again.`);
			} finally {
				setDeciding(null);
			}
		},
		[appendAssistant, decide, refetchInteractions, setApprovalStatus],
	);

	const answerQuestion = useCallback(
		(messageId: string, answer: string, response?: LeafQuestionResponse) => {
			// Retire the chips in place, then send the label as the visible message
			// with the structured answer in metadata (resolved via inputResponses).
			setMessages((prev) =>
				prev.map((message) =>
					message.id === messageId
						? {
								...message,
								parts: message.parts.map((part) =>
									part.type === "data-question"
										? { ...part, data: { ...part.data, status: "answered" } }
										: part,
								),
							}
						: message,
				),
			);
			sendMessage({
				metadata: response ? { questionResponse: response } : undefined,
				text: answer,
			});
		},
		[sendMessage, setMessages],
	);

	const submitCatalogDecision = useCallback(
		(messageId: string, decision: LeafCatalogDecision) => {
			setMessages((prev) =>
				prev.map((message) =>
					message.id === messageId
						? {
								...message,
								parts: message.parts.map((part) =>
									part.type === "data-catalog-decision" &&
									part.data.plan.plan_id === decision.planId
										? { ...part, data: { ...part.data, status: "submitted" } }
										: part,
								),
							}
						: message,
				),
			);
			sendMessage({
				metadata: { catalogDecision: decision },
				text: decisionSummaryText(decision),
			});
		},
		[sendMessage, setMessages],
	);

	// ChatGPT/Claude-style queueing: messages typed mid-turn are queued and
	// auto-sent when the turn completes; "Send now" interrupts the stream first.
	// "error" is a settled state, not busy — sends must not queue behind it.
	const [queue, setQueue] = useState<PromptInputMessage[]>([]);
	useEffect(() => {
		if (isLoading || queue.length === 0) return;
		const [next, ...rest] = queue;
		setQueue(rest);
		sendMessage({ files: next.files, text: next.text });
	}, [isLoading, queue, sendMessage]);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			if (!message.text.trim() && message.files.length === 0) return;
			if (isLoading) {
				setQueue((prev) => [...prev, message]);
				setInput("");
				return;
			}
			if (messages.length === 0) onFirstMessage?.();
			sendMessage({ files: message.files, text: message.text });
			setInput("");
		},
		[messages.length, onFirstMessage, isLoading, sendMessage],
	);

	// Interrupting flushes the queue via the status effect once the stream stops.
	const sendQueuedNow = useCallback(() => {
		void stop();
	}, [stop]);

	const removeQueued = useCallback((index: number) => {
		setQueue((prev) => prev.filter((_, i) => i !== index));
	}, []);

	return {
		answerQuestion,
		error,
		queue,
		removeQueued,
		sendQueuedNow,
		approve: (id: string) => resolveApproval("approve", id),
		deciding,
		handleSubmit,
		input,
		isLoading,
		messages,
		reject: (id: string) => resolveApproval("reject", id),
		setInput,
		submitCatalogDecision,
	};
}
