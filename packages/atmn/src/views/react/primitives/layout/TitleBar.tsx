import { Box, Text } from "ink";

export interface TitleBarItem {
	label: string;
	value: string;
	color?: string; // Text color for value (default: "white")
}

export interface TitleBarProps {
	/** The command name to display (e.g., "atmn customers") */
	commandName: string;
	/** Optional version string */
	version?: string;
	/** Pagination display text (e.g., "Page 1 of many") */
	paginationText?: string;
	/** Active search query to display */
	searchQuery?: string;
	/** Additional items to display */
	extraItems?: TitleBarItem[];
}

/**
 * Generic title bar for list views with round border, showing version,
 * command name, pagination info, extra items, and search query.
 */
export function TitleBar({
	commandName,
	version,
	paginationText,
	searchQuery,
	extraItems,
}: TitleBarProps) {
	return (
		<Box
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			width="100%"
			justifyContent="center"
		>
			{version && (
				<>
					<Text color="gray">{version}</Text>
					<Text color="gray"> │ </Text>
				</>
			)}
			<Text bold color="white">
				{commandName}
			</Text>
			{paginationText && (
				<>
					<Text color="gray"> │ </Text>
					<Text color="gray">{paginationText}</Text>
				</>
			)}
			{extraItems?.map((item) => (
				<Text key={`${item.label}-${item.value}`}>
					<Text color="gray"> │ </Text>
					<Text color="gray">{item.label}: </Text>
					<Text color={item.color ?? "white"}>{item.value}</Text>
				</Text>
			))}
			{searchQuery && (
				<>
					<Text color="gray"> │ </Text>
					<Text color="magenta">search: </Text>
					<Text color="white">{searchQuery}</Text>
					<Text color="gray"> (x to clear)</Text>
				</>
			)}
		</Box>
	);
}
