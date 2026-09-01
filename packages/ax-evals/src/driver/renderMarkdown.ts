import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

/** Chat lines carry a `│  │ ` gutter; text wraps to what's left. */
export const chatTextWidth = (): number => {
	const columns = process.stderr.columns ?? 100;
	return Math.max(40, Math.min(columns - 6, 120));
};

/**
 * Agent replies are markdown (tables, bold, code fences); render them as
 * styled terminal text instead of raw asterisks and pipes.
 */
export const renderMarkdown = (text: string): string => {
	const marked = new Marked(
		markedTerminal({ width: chatTextWidth(), reflowText: true }) as Parameters<
			Marked["use"]
		>[0],
	);
	const rendered = marked.parse(text, { async: false });
	if (typeof rendered !== "string") return text;
	return rendered.replace(/\n{3,}/g, "\n\n").trimEnd();
};
