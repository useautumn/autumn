import { Box, Text } from "ink";

interface ErrorCardProps {
	error: string;
}

/**
 * Error display card
 */
export function ErrorCard({ error }: ErrorCardProps) {
	return (
		<Box flexDirection="column" padding={1}>
			<Text color="red" bold>
				✗ Error pushing to Autumn
			</Text>
			<Text color="red">{error}</Text>
		</Box>
	);
}
