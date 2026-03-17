import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export interface LoadingStateProps {
	message?: string;
}

/**
 * Generic loading state with spinner
 */
export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="gray"
			paddingX={2}
			paddingY={1}
			width="100%"
		>
			<Box>
				<Text color="magenta">
					<Spinner type="dots" />
				</Text>
				<Text> {message}</Text>
			</Box>
		</Box>
	);
}
