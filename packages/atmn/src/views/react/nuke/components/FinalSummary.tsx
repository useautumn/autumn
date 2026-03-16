import { Box, Text } from "ink";
import { Card } from "../../components/index.js";

interface FinalSummaryProps {
	customers: number;
	plans: number;
	features: number;
	backupCreated?: boolean;
}

/**
 * Final summary screen shown after explosion animation
 * Displays completion stats for user's benefit
 */
export function FinalSummary({
	customers,
	plans,
	features,
	backupCreated,
}: FinalSummaryProps) {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Card title="✨ Nuke Complete">
				<Text color="green">✓ {customers} customers deleted</Text>
				<Text color="green">✓ {plans} plans deleted</Text>
				<Text color="green">✓ {features} features deleted</Text>
				<Box height={1} />
				{backupCreated && (
					<>
						<Text dimColor>Backup saved to autumn.config.ts.backup</Text>
						<Box height={1} />
					</>
				)}
				<Text bold color="magenta">
					Your sandbox is now empty.
				</Text>
				<Text dimColor>Ready for a fresh start!</Text>
			</Card>
		</Box>
	);
}
