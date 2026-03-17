import { Box, Text } from "ink";
import type { ErrorStateProps } from "../types.js";

/**
 * Error state with retry option
 */
export function ErrorState({ error, onRetry: _onRetry }: ErrorStateProps) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="red"
			paddingX={2}
			paddingY={1}
		>
			<Box>
				<Text color="red" bold>
					✗ Error loading customers
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>{error.message}</Text>
			</Box>
			<Box marginTop={1}>
				<Text>
					Press <Text color="magenta">r</Text> to retry or{" "}
					<Text color="magenta">q</Text> to quit
				</Text>
			</Box>
		</Box>
	);
}
