import { Box, Text } from "ink";

export interface EmptyStateProps {
	title: string;
	description?: string;
	searchQuery?: string;
}

/**
 * Generic empty state with customizable content
 */
export function EmptyState({
	title,
	description,
	searchQuery,
}: EmptyStateProps) {
	if (searchQuery) {
		return (
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="gray"
				paddingX={2}
				paddingY={1}
				width="100%"
				alignItems="center"
				justifyContent="center"
			>
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
			borderColor="gray"
			paddingX={2}
			paddingY={1}
			width="100%"
			alignItems="center"
			justifyContent="center"
		>
			<Box marginTop={1}>
				<Text bold>{title}</Text>
			</Box>
			{description && (
				<Box marginTop={1}>
					<Text dimColor>{description}</Text>
				</Box>
			)}
		</Box>
	);
}
