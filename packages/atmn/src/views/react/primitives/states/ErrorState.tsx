import { Box, Text } from "ink";

export interface ErrorStateProps {
	error: Error;
	onRetry?: () => void;
}

/**
 * Generic error state with retry hint
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="red"
			paddingX={2}
			paddingY={1}
			width="100%"
		>
			<Box>
				<Text color="red" bold>
					Error
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>{error.message}</Text>
			</Box>
			<Box marginTop={1}>
				<Text>
					{onRetry && (
						<>
							Press <Text color="magenta">r</Text> to retry or{" "}
						</>
					)}
					Press <Text color="magenta">q</Text> to quit
				</Text>
			</Box>
		</Box>
	);
}
