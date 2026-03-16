import { Box, Text } from "ink";

export interface SheetSectionProps {
	/** Section title */
	title: string;
	/** Content to render */
	children: React.ReactNode;
	/** Optional: show "empty" message if no children */
	emptyMessage?: string;
	/** Whether section is empty (to show emptyMessage) */
	isEmpty?: boolean;
}

/**
 * Generic section container for grouping related info within a sheet.
 */
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
