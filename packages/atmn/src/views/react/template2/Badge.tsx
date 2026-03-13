import { Box, Text } from "ink";

export type BadgeColor =
	| "cyan"
	| "yellow"
	| "green"
	| "blue"
	| "gray"
	| "magenta";

export interface BadgeProps {
	label: string;
	color: BadgeColor;
}

/**
 * Colored pill badge with background color
 * Uses terminal-native colors that respect user's theme
 */
export function Badge({ label, color }: BadgeProps) {
	// Use terminal-native colors - these adapt to the user's terminal theme
	// Background uses the color, text is white for contrast
	return (
		<Box backgroundColor={color}>
			<Text color="white" bold>{` ${label} `}</Text>
		</Box>
	);
}
