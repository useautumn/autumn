import { Box, Text } from "ink";
import { Card } from "../../components/index.js";

export function NoChangesCard() {
	return (
		<Card title="✅ No Changes">
			<Box flexDirection="column">
				<Text>Your local config matches the remote.</Text>
				<Text>Nothing to push.</Text>
			</Box>
		</Card>
	);
}
