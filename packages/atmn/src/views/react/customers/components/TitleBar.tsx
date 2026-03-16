import { Box, Text } from "ink";
import { APP_VERSION } from "../../../../lib/version.js";
import type { TitleBarProps } from "../types.js";

/**
 * Title bar showing version, command name, pagination info, and search query
 */
export function TitleBar({
	environment,
	pagination,
	searchQuery,
}: TitleBarProps) {
	return (
		<Box
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			width="100%"
			justifyContent="center"
		>
			<Text color="gray">{APP_VERSION}</Text>
			<Text color="gray"> │ </Text>
			<Text bold color="white">
				atmn customers
			</Text>
			<Text color="gray"> │ </Text>
			<Text color="gray">{pagination.display}</Text>
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
