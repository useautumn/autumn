import { Box, Text } from "ink";
import { AppEnv } from "../../../../lib/env/detect.js";
import type { EmptyStateProps } from "../types.js";

/**
 * Empty state when no customers exist
 */
export function EmptyState({ environment, searchQuery }: EmptyStateProps) {
	const envLabel = environment === AppEnv.Sandbox ? "sandbox" : "live";

	// Different message when search has no results
	if (searchQuery) {
		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="magenta"
				paddingX={2}
				paddingY={1}
				width="100%"
				minHeight={10}
				alignItems="center"
				justifyContent="center"
			>
				<Text>🔍</Text>
				<Box marginTop={1}>
					<Text bold>No results for "{searchQuery}"</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Try a different search term or press <Text color="magenta">x</Text>{" "}
						to clear the search.
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="magenta"
			paddingX={2}
			paddingY={1}
			width="100%"
			minHeight={15}
			alignItems="center"
			justifyContent="center"
		>
			<Text>📭</Text>
			<Box marginTop={1}>
				<Text bold>No customers found</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					There are no customers in your {envLabel} environment yet.
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					Create customers via the API or dashboard to see them here.
				</Text>
			</Box>
		</Box>
	);
}
