import { Box, Text } from "ink";

export interface KeybindHint {
	key: string;
	label: string;
	visible?: boolean;
}

export interface BottomBarProps {
	hints: KeybindHint[];
}

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
