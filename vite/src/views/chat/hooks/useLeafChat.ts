import { useChat } from "@ai-sdk/react";
import type { PromptInputMessage } from "@autumn/ui/ai-elements";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import type {
	ApprovalStatus,
	DecidingState,
	LeafApproval,
	LeafUIMessage,
} from "../chatTypes";
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

const approvalMessage = (approval: LeafApproval): LeafUIMessage => ({
	id: `approval-${approval.id}`,
	parts: [
		{
			data: {
				approvalId: approval.id,
				preview: approval.preview,
				status: "pending",
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

	const { messages, sendMessage, status, setMessages } = useChat<LeafUIMessage>(
		{
			id: threadId,
			transport: new DefaultChatTransport({
				api: `${BACKEND}/agent/chat`,
				credentials: "include",
				headers: { "x-client-type": "dashboard" },
			}),
		},
	);

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
		if (!approvals?.length) return;
		setMessages((prev) => {
			const present = approvalIdsIn(prev);
			const fresh = approvals.filter((approval) => !present.has(approval.id));
			return fresh.length === 0
				? prev
				: [...prev, ...fresh.map(approvalMessage)];
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
				if (action === "approve" && data.text) appendAssistant(data.text);
				void refetchInteractions();
			} catch {
				appendAssistant(`Couldn't ${verb} the changes. Please try again.`);
			} finally {
				setDeciding(null);
			}
		},
		[appendAssistant, decide, refetchInteractions, setApprovalStatus],
	);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			if (
				(!message.text.trim() && message.files.length === 0) ||
				status !== "ready"
			) {
				return;
			}
			if (messages.length === 0) onFirstMessage?.();
			sendMessage({ files: message.files, text: message.text });
			setInput("");
		},
		[messages.length, onFirstMessage, status, sendMessage],
	);

	return {
		approve: (id: string) => resolveApproval("approve", id),
		deciding,
		handleSubmit,
		input,
		isLoading,
		messages,
		reject: (id: string) => resolveApproval("reject", id),
		setInput,
	};
}
