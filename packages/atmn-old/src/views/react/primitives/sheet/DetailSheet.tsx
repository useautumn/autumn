import { Box, Text } from "ink";

export interface DetailSheetProps {
	title: string;
	subtitle?: string;
	isFocused: boolean;
	children: React.ReactNode;
	actions?: React.ReactNode;
	minWidth?: number;
}

export function DetailSheet({
	title,
	subtitle,
	isFocused,
	children,
	actions,
	minWidth = 44,
}: DetailSheetProps) {
	const borderColor = isFocused ? "magenta" : "gray";

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={borderColor}
			paddingX={1}
			minWidth={minWidth}
			height="100%"
		>
			<Text bold color="white">
				{title}
			</Text>

			{subtitle && <Text color="gray">{subtitle}</Text>}

			{children}

			<Box flexGrow={1} />

			{actions && <Box flexDirection="column">{actions}</Box>}
		</Box>
	);
}
