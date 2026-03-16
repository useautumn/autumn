import { ProgressBar } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ApiBalance } from "../../types.js";

export interface BalancesSectionProps {
	balances: Record<string, ApiBalance>;
}

/**
 * Renders customer feature balances.
 * - Boolean features: ON/OFF toggle
 * - Metered features with unlimited: "Unlimited" badge
 * - Metered features with limits: Progress bar showing usage
 */
export function BalancesSection({ balances }: BalancesSectionProps) {
	const balanceList = Object.values(balances);

	if (balanceList.length === 0) {
		return null; // Don't show section if no balances
	}

	// Separate boolean and metered features
	const booleanBalances = balanceList.filter(
		(b) => b.feature?.type === "boolean",
	);
	const meteredBalances = balanceList.filter(
		(b) => b.feature?.type !== "boolean",
	);

	return (
		<Box flexDirection="column">
			{/* Boolean Features */}
			{booleanBalances.length > 0 && (
				<Box flexDirection="column">
					<Text bold color="gray">
						Features
					</Text>
					{booleanBalances.map((balance) => (
						<BooleanFeatureRow key={balance.feature_id} balance={balance} />
					))}
				</Box>
			)}

			{/* Metered Features */}
			{meteredBalances.length > 0 && (
				<Box
					flexDirection="column"
					marginTop={booleanBalances.length > 0 ? 1 : 0}
				>
					<Text bold color="gray">
						Usage
					</Text>
					{meteredBalances.map((balance) => (
						<MeteredFeatureRow key={balance.feature_id} balance={balance} />
					))}
				</Box>
			)}
		</Box>
	);
}

/**
 * Boolean feature display (ON/OFF)
 */
function BooleanFeatureRow({ balance }: { balance: ApiBalance }) {
	const featureName = balance.feature?.name ?? balance.feature_id;

	return (
		<Box>
			<Text color="green">ON </Text>
			<Text>{featureName}</Text>
		</Box>
	);
}

/**
 * Metered feature display with progress bar
 */
function MeteredFeatureRow({ balance }: { balance: ApiBalance }) {
	const featureName = balance.feature?.name ?? balance.feature_id;
	const displayName =
		balance.feature?.display?.plural ??
		balance.feature?.display?.singular ??
		featureName;

	// Unlimited feature
	if (balance.unlimited) {
		return (
			<Box>
				<Text>{displayName}: </Text>
				<Text color="cyan" bold>
					Unlimited
				</Text>
			</Box>
		);
	}

	// Calculate usage percentage
	const total = balance.granted_balance + balance.purchased_balance;
	const used = balance.usage;
	const remaining = balance.current_balance;

	// Handle edge cases
	if (total <= 0) {
		return (
			<Box>
				<Text>{displayName}: </Text>
				<Text dimColor>No allocation</Text>
			</Box>
		);
	}

	const percentage = Math.min(100, Math.round((used / total) * 100));
	const isOverage = remaining < 0;

	return (
		<Box flexDirection="column">
			<Box>
				<Text>{displayName}: </Text>
				<Text
					color={
						isOverage ? "red" : remaining < total * 0.2 ? "yellow" : "white"
					}
				>
					{remaining.toLocaleString()} / {total.toLocaleString()}
				</Text>
				{isOverage && <Text color="red"> (overage)</Text>}
			</Box>
			<Box width={30}>
				<ProgressBar value={percentage} />
			</Box>
			{balance.reset?.resets_at && (
				<Text dimColor>Resets: {formatResetDate(balance.reset.resets_at)}</Text>
			)}
		</Box>
	);
}

/**
 * Format reset timestamp
 */
function formatResetDate(timestamp: number): string {
	const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
	const date = new Date(ms);
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
