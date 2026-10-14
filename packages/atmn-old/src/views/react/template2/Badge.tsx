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

export function Badge({ label, color }: BadgeProps) {
	return (
		<Box backgroundColor={color}>
			<Text color="white" bold>{` ${label} `}</Text>
		</Box>
	);
}
