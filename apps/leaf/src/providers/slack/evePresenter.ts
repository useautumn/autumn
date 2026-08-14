import type { StatusTicker } from "../../ui/statusTicker.js";

const REASONING_STATUS_INTERVAL_MS = 3000;
const REASONING_STATUS_MAX_CHARS = 100;

const reasoningSnippet = (text: string) => {
	const flattened = text.replace(/\s+/g, " ").trim();
	return flattened.length > REASONING_STATUS_MAX_CHARS
		? `…${flattened.slice(-REASONING_STATUS_MAX_CHARS)}`
		: flattened;
};

/** Eve progress stays in Slack's assistant status until an interactive card or reply. */
export const createEveSlackPresenter = ({
	ticker,
}: {
	ticker: StatusTicker;
}) => {
	let lastReasoningAt = 0;
	return {
		onAction: (label: string) => ticker.activity(label),
		onReasoning: ({ text }: { id: string; text: string }) => {
			if (!text.trim()) return;
			const now = Date.now();
			if (now - lastReasoningAt < REASONING_STATUS_INTERVAL_MS) return;
			lastReasoningAt = now;
			ticker.activity(reasoningSnippet(text));
		},
	};
};
