import { Box, Text } from "ink";
import { AppEnv } from "../../../../lib/env/index.js";

const FRONTEND_URL = "https://app.useautumn.com";

interface CompletionMessageProps {
	duration: string;
	environment?: AppEnv;
}

export function CompletionMessage({
	duration,
	environment,
}: CompletionMessageProps) {
	const dashboardPath =
		environment === AppEnv.Live ? "/products" : "/sandbox/products";

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text color="green">✨ Done in {duration}s</Text>
			<Text color="magenta">
				View at: {FRONTEND_URL}
				{dashboardPath}
			</Text>
		</Box>
	);
}
