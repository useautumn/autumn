import { Box, Text } from "ink";

export interface SheetSectionProps {
	title: string;
	children: React.ReactNode;
	emptyMessage?: string;
	isEmpty?: boolean;
}

export function SheetSection({
	title,
	children,
	emptyMessage,
	isEmpty,
}: SheetSectionProps) {
	return (
		<Box flexDirection="column" marginTop={1}>
			<Text bold color="gray">
				{title}
			</Text>
			{isEmpty && emptyMessage ? (
				<Text dimColor>{emptyMessage}</Text>
			) : (
				children
			)}
		</Box>
	);
}
