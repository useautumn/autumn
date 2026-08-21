import { ms } from "@autumn/shared";
import type { AgentActionProgress } from "../../internal/agentRuntime/domain/agentTurnContext.js";

const REASONING_STATUS_INTERVAL_MS = ms.seconds(3);
const REASONING_STATUS_MAX_CHARS = 100;

const reasoningSnippet = (text: string) => {
	const flattened = text.replace(/\s+/g, " ").trim();
	return flattened.length > REASONING_STATUS_MAX_CHARS
		? `…${flattened.slice(-REASONING_STATUS_MAX_CHARS)}`
		: flattened;
};

/** Eve progress stays in Slack's assistant status until an interactive card or reply. */
export const createEveSlackPresenter = ({
	setStatus,
}: {
	setStatus: (message: string) => void;
}) => {
	let lastReasoningAt = 0;
	return {
		onAction: (progress: AgentActionProgress | string) => {
			if (typeof progress === "string") setStatus(progress);
			else if (progress.phase === "started") setStatus(progress.label);
		},
		onReasoning: ({ text }: { id: string; text: string }) => {
			if (!text.trim()) return;
			const now = Date.now();
			if (now - lastReasoningAt < REASONING_STATUS_INTERVAL_MS) return;
			lastReasoningAt = now;
			setStatus(reasoningSnippet(text));
		},
	};
};
