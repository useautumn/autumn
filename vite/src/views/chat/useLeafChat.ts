import { useChat } from "@ai-sdk/react";
import type { PromptInputMessage } from "@autumn/ui/ai-elements";
import { DefaultChatTransport } from "ai";
import { useCallback, useState } from "react";

/**
 * Chat with the Leaf agent, brokered through the main server (cookie auth) to
 * Leaf's web adapter. Mirrors the pricing agent's useChat setup; the conversation
 * id is auto-managed by useChat and sent in the request body, which the web
 * adapter maps to a `web:{user}:{id}` thread.
 */
export function useLeafChat() {
	const [input, setInput] = useState("");

	const { messages, sendMessage, status } = useChat({
		transport: new DefaultChatTransport({
			api: `${import.meta.env.VITE_BACKEND_URL}/agent/chat`,
			credentials: "include",
			headers: { "x-client-type": "dashboard" },
		}),
	});

	const isLoading = status === "streaming" || status === "submitted";

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

	return { messages, input, setInput, isLoading, handleSubmit };
}
