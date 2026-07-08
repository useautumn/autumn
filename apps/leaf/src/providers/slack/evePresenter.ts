import type { StatusTicker } from "../../ui/statusTicker.js";

const REASONING_STATUS_INTERVAL_MS = 3000;
const REASONING_STATUS_MAX_CHARS = 100;

const reasoningSnippet = (text: string) => {
	const flattened = text.replace(/\s+/g, " ").trim();
	return flattened.length > REASONING_STATUS_MAX_CHARS
		? `…${flattened.slice(-REASONING_STATUS_MAX_CHARS)}`
		: flattened;
};

/**
 * Slack progress for an eve run lives entirely in the assistant status line
 * (Slack's AI-app convention): tool labels and reasoning snippets while the
 * run works, nothing posted until the reply. Cards appear only for
 * interactive moments (approvals, questions, decisions).
 */
export const createEveSlackPresenter = ({
	ticker,
}: {
	ticker: StatusTicker;
}) => {
	let lastReasoningAt = 0;
	return {
		onAction: (label: string) => ticker.activity(label),
		onActionError: (message: string) => ticker.activity(message),
		onThinking: () => ticker.thinking(),
		onReasoning: ({ text }: { id: string; text: string }) => {
			if (!text.trim()) return;
			const now = Date.now();
			if (now - lastReasoningAt < REASONING_STATUS_INTERVAL_MS) return;
			lastReasoningAt = now;
			ticker.activity(reasoningSnippet(text));
		},
	};
};

export type EveSlackPresenter = ReturnType<typeof createEveSlackPresenter>;
