import { useChat } from "@ai-sdk/react";
import type { CatalogPreviewUpdateResponse } from "@autumn/shared";
import type { PromptInputMessage } from "@autumn/ui/ai-elements";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";

const BACKEND = import.meta.env.VITE_BACKEND_URL;

/** A pending plan-write approval the dashboard fetches beside the text stream. */
export interface LeafApproval {
	id: string;
	tool_name: string;
	tool_args: unknown;
	preview: CatalogPreviewUpdateResponse | null;
	created_at: number;
}

/**
 * Chat with the Leaf agent, brokered through the main server (cookie auth) to
 * Leaf's web adapter. The text stream carries assistant prose; structured plan
 * previews + approvals are fetched separately (the web adapter is text-only) and
 * resolved via /agent/approve|reject.
 */
export function useLeafChat() {
	const [input, setInput] = useState("");
	const [pendingApproval, setPendingApproval] = useState<LeafApproval | null>(
		null,
	);
	const [deciding, setDeciding] = useState(false);

	const { messages, sendMessage, status, setMessages } = useChat({
		transport: new DefaultChatTransport({
			api: `${BACKEND}/agent/chat`,
			credentials: "include",
			headers: { "x-client-type": "dashboard" },
		}),
	});

	const isLoading = status === "streaming" || status === "submitted";

	const fetchInteractions = useCallback(async () => {
		try {
			const res = await fetch(`${BACKEND}/agent/interactions`, {
				credentials: "include",
			});
			if (!res.ok) return;
			const data = (await res.json()) as { approvals?: LeafApproval[] };
			setPendingApproval(data.approvals?.[0] ?? null);
		} catch {
			// Best-effort — a failed poll just leaves the prior state.
		}
	}, []);

	// A turn that suspended on a destructive write records an approval; fetch it
	// once the stream settles.
	useEffect(() => {
		if (status === "ready") void fetchInteractions();
	}, [status, fetchInteractions]);

	const decide = useCallback(
		async (action: "approve" | "reject", approvalId: string) => {
			setDeciding(true);
			try {
				const res = await fetch(`${BACKEND}/agent/${action}`, {
					method: "POST",
					credentials: "include",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ approvalId }),
				});
				const data = (await res.json()) as { text?: string };
				setPendingApproval(null);
				if (action === "approve" && data.text) {
					setMessages((prev) => [
						...prev,
						{
							id: crypto.randomUUID(),
							role: "assistant",
							parts: [{ type: "text", text: data.text ?? "" }],
						},
					]);
				}
				void fetchInteractions();
			} finally {
				setDeciding(false);
			}
		},
		[fetchInteractions, setMessages],
	);

	const handleSubmit = useCallback(
		(message: PromptInputMessage) => {
			if (
				(!message.text.trim() && message.files.length === 0) ||
				status !== "ready"
			) {
				return;
			}
			sendMessage({ text: message.text, files: message.files });
			setInput("");
		},
		[status, sendMessage],
	);

	return {
		messages,
		input,
		setInput,
		isLoading,
		handleSubmit,
		pendingApproval,
		deciding,
		approve: (id: string) => decide("approve", id),
		reject: (id: string) => decide("reject", id),
	};
}
