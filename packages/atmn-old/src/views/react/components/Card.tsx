import { Box, Text } from "ink";
import React, { type ReactNode, useEffect, useId, useMemo } from "react";
import { useCardWidth } from "./providers/CardWidthContext.js";

const DEFAULT_WIDTH = 65;
const BORDER_PADDING_OVERHEAD = 6;

interface CardProps {
	title: string;
	children?: ReactNode;
}

function getStringWidth(str: string): number {
	const stripped = str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);

	let width = 0;
	for (const char of stripped) {
		const code = char.codePointAt(0) ?? 0;
		if (code > 0x1f600 || (code >= 0x2600 && code <= 0x27bf)) {
			width += 2;
		} else if (code >= 0x4e00 && code <= 0x9fff) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

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

export function Card({ title, children }: CardProps) {
	const id = useId();
	const cardWidth = useCardWidth();

	const contentWidth = useMemo(() => {
		const titleWidth = getStringWidth(title);

		let maxLineWidth = titleWidth;
		if (children) {
			const textLines = extractTextContent(children);
			for (const line of textLines) {
				const lineWidth = getStringWidth(line);
				if (lineWidth > maxLineWidth) {
					maxLineWidth = lineWidth;
				}
			}
		}

		return maxLineWidth + BORDER_PADDING_OVERHEAD;
	}, [title, children]);

	useEffect(() => {
		if (cardWidth) {
			cardWidth.registerWidth(id, contentWidth);
			return () => cardWidth.unregisterWidth(id);
		}
		return undefined;
	}, [id, contentWidth, cardWidth]);

	const width = cardWidth?.width ?? Math.max(DEFAULT_WIDTH, contentWidth);

	return (
		<Box
			borderStyle="round"
			borderColor="magenta"
			paddingX={1}
			paddingY={0}
			flexDirection="column"
			width={width}
		>
			<Text bold color="magenta">
				{title}
			</Text>
			{children && (
				<Box flexDirection="column" marginTop={1}>
					{children}
				</Box>
			)}
		</Box>
	);
}
