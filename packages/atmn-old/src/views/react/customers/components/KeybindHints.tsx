import { Box, Text } from "ink";
import type { KeybindHintsProps } from "../types.js";

/**
 * Context-aware keyboard shortcut hints
 */
export function KeybindHints({
	focusTarget,
	sheetOpen,
	canGoPrev,
	canGoNext,
}: KeybindHintsProps) {
	if (focusTarget === "sheet" && sheetOpen) {
		return (
			<Box
				borderStyle="round"
				borderColor="gray"
				paddingX={1}
				width="100%"
				justifyContent="center"
				gap={2}
			>
				<Text>
					<Text color="magenta">Tab</Text>
					<Text color="gray"> focus table</Text>
				</Text>
				<Text>
					<Text color="magenta">Esc</Text>
					<Text color="gray"> close</Text>
				</Text>
				<Text>
					<Text color="magenta">c</Text>
					<Text color="gray"> copy ID</Text>
				</Text>
				<Text>
					<Text color="magenta">o</Text>
					<Text color="gray"> open</Text>
				</Text>
				<Text>
					<Text color="magenta">q</Text>
					<Text color="gray"> quit</Text>
				</Text>
			</Box>
		);
	}

	// Table focused hints
	return (
		<Box
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			width="100%"
			justifyContent="center"
			gap={2}
		>
			<Text>
				<Text color="magenta">↑↓</Text>
				<Text color="gray"> navigate</Text>
			</Text>
			{canGoPrev && (
				<Text>
					<Text color="magenta">←</Text>
					<Text color="gray"> prev page</Text>
				</Text>
			)}
			{canGoNext && (
				<Text>
					<Text color="magenta">→</Text>
					<Text color="gray"> next page</Text>
				</Text>
			)}
			<Text>
				<Text color="magenta">Enter</Text>
				<Text color="gray"> inspect</Text>
			</Text>
			<Text>
				<Text color="magenta">/</Text>
				<Text color="gray"> search</Text>
			</Text>
			<Text>
				<Text color="magenta">r</Text>
				<Text color="gray"> refresh</Text>
			</Text>
			<Text>
				<Text color="magenta">q</Text>
				<Text color="gray"> quit</Text>
			</Text>
		</Box>
	);
}
