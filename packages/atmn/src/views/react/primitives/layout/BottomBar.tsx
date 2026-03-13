import { Box, Text } from "ink";

export interface KeybindHint {
	/** The key or key combination (e.g., "↑↓", "Enter", "q") */
	key: string;
	/** Description of what the key does (e.g., "navigate", "select", "quit") */
	label: string;
	/** Only show this hint if condition is true (default: true) */
	visible?: boolean;
}

export interface BottomBarProps {
	/** Array of keyboard hints to display */
	hints: KeybindHint[];
}

/**
 * Generic keyboard hints bar for list views with round border.
 * Displays keybinds with pipe separators.
 */
export function BottomBar({ hints }: BottomBarProps) {
	const visibleHints = hints.filter((hint) => hint.visible !== false);

	return (
		<Box
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			width="100%"
			justifyContent="center"
			gap={2}
		>
			{visibleHints.map((hint, index) => (
				<Text key={`${hint.key}-${hint.label}`}>
					{index > 0 && <Text color="gray">│ </Text>}
					<Text color="magenta">{hint.key}</Text>
					<Text color="gray"> {hint.label}</Text>
				</Text>
			))}
		</Box>
	);
}
