import { Box, Text } from "ink";
import { useEffect } from "react";
import { Card } from "../../components/index.js";

interface SuccessScreenProps {
	customers: number;
	plans: number;
	features: number;
	backupCreated?: boolean;
	onComplete: () => void;
}

/**
 * Success screen showing summary before explosion animation
 */
export function SuccessScreen({
	customers,
	plans,
	features,
	backupCreated,
	onComplete,
}: SuccessScreenProps) {
	// Auto-advance to explosion after 1.5 seconds
	useEffect(() => {
		const timer = setTimeout(() => {
			onComplete();
		}, 1500);

		return () => clearTimeout(timer);
	}, [onComplete]);

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Card title="☢ Nuke Complete">
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
				<Text bold>Your sandbox is now empty.</Text>
			</Card>
		</Box>
	);
}
