import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { AppEnv } from "../../../../lib/env/detect.js";
import type { LoadingStateProps } from "../types.js";

/**
 * Loading state with spinner
 */
export function LoadingState({ environment }: LoadingStateProps) {
	const envLabel = environment === AppEnv.Sandbox ? "sandbox" : "live";

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="gray"
			paddingX={2}
			paddingY={1}
		>
			<Box>
				<Text color="magenta">
					<Spinner type="dots" />
				</Text>
				<Text> Loading customers from {envLabel}...</Text>
			</Box>
		</Box>
	);
}
