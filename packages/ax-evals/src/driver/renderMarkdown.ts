import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

export const chatTextWidth = (): number => {
	const columns = process.stderr.columns ?? 100;
	return Math.max(40, Math.min(columns - 6, 120));
};

export const renderMarkdown = (text: string): string => {
	const marked = new Marked(
		markedTerminal({ width: chatTextWidth(), reflowText: true }) as Parameters<
			Marked["use"]
		>[0],
	);
	const rendered = marked.parse(text, { async: false });
	if (typeof rendered !== "string") return text;
	return (
		rendered
			.replace(/^(\s*)(?:\* )?(\[[ xX]\])\s+(?=\[[ xX]\] )/gm, "$1")
			.replace(/\n{3,}/g, "\n\n")
			.trimEnd()
	);
};
