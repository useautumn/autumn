import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import React, { type ReactNode, useEffect, useId, useMemo } from "react";
import { useCardWidth } from "./providers/CardWidthContext.js";

const DEFAULT_WIDTH = 65;
// Account for border (2 chars) + padding (2 chars on each side)
const BORDER_PADDING_OVERHEAD = 6;

interface PromptOption {
	label: string;
	value: string;
}

interface PromptCardProps {
	title: string;
	icon?: string;
	children: ReactNode;
	options: PromptOption[];
	onSelect: (value: string) => void;
}

/**
 * Calculate the display width of a string (accounting for ANSI codes, emojis, etc.)
 */
function getStringWidth(str: string): number {
	// Strip ANSI codes
	const stripped = str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);

	let width = 0;
	for (const char of stripped) {
		const code = char.codePointAt(0) ?? 0;
		// Emoji and wide characters (rough heuristic)
		if (code > 0x1f600 || (code >= 0x2600 && code <= 0x27bf)) {
			width += 2;
		} else if (code >= 0x4e00 && code <= 0x9fff) {
			// CJK characters
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

/**
 * Recursively extract text content from React children to measure width
 */
function extractTextContent(children: ReactNode): string[] {
	const lines: string[] = [];

	const extract = (node: ReactNode): void => {
		if (node === null || node === undefined || typeof node === "boolean") {
			return;
		}

		if (typeof node === "string" || typeof node === "number") {
			lines.push(String(node));
			return;
		}

		if (Array.isArray(node)) {
			for (const child of node) {
				extract(child);
			}
			return;
		}

		if (React.isValidElement(node)) {
			const props = node.props as { children?: ReactNode };
			if (props.children) {
				extract(props.children);
			}
		}
	};

	extract(children);
	return lines;
}

/**
 * Card component with a select menu for prompts
 * Coordinates width with other Cards via CardWidthContext
 */
export function PromptCard({
	title,
	icon,
	children,
	options,
	onSelect,
}: PromptCardProps) {
	const id = useId();
	const cardWidth = useCardWidth();

	const handleSelect = (item: { value: string }) => {
		onSelect(item.value);
	};

	// Calculate the content width needed for this card
	const contentWidth = useMemo(() => {
		const fullTitle = icon ? `${icon} ${title}` : title;
		const titleWidth = getStringWidth(fullTitle);

		let maxLineWidth = titleWidth;

		// Check children content
		if (children) {
			const textLines = extractTextContent(children);
			for (const line of textLines) {
				const lineWidth = getStringWidth(line);
				if (lineWidth > maxLineWidth) {
					maxLineWidth = lineWidth;
				}
			}
		}

		// Check option labels
		for (const opt of options) {
			// Add 4 for the select indicator "❯ " or "  "
			const optWidth = getStringWidth(opt.label) + 4;
			if (optWidth > maxLineWidth) {
				maxLineWidth = optWidth;
			}
		}

		// Add overhead for border and padding
		return maxLineWidth + BORDER_PADDING_OVERHEAD;
	}, [title, icon, children, options]);

	// Register our width with the context
	useEffect(() => {
		if (cardWidth) {
			cardWidth.registerWidth(id, contentWidth);
			return () => cardWidth.unregisterWidth(id);
		}
		return undefined;
	}, [id, contentWidth, cardWidth]);

	// Use shared width from context, or fallback to default
	const width = cardWidth?.width ?? Math.max(DEFAULT_WIDTH, contentWidth);

	return (
		<Box
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
			paddingY={0}
			flexDirection="column"
			width={width}
		>
			<Text bold color="yellow">
				{icon ? `${icon} ${title}` : title}
			</Text>
			<Box flexDirection="column" marginTop={1}>
				{children}
			</Box>
			<Box marginTop={1}>
				<SelectInput items={options} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
