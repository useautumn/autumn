import { Box, Text } from "ink";
import type { ApiSubscription } from "../../types.js";
import { formatDate } from "../../types.js";

export interface SubscriptionsSectionProps {
	subscriptions: ApiSubscription[];
	title?: string;
}

/**
 * Renders customer subscriptions with optional plan info
 */
export function SubscriptionsSection({
	subscriptions,
	title = "Subscriptions",
}: SubscriptionsSectionProps) {
	if (subscriptions.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="gray">
					{title}
				</Text>
				<Text dimColor>No subscriptions</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="gray">
				{title} ({subscriptions.length})
			</Text>
			<Box flexDirection="column" paddingLeft={1}>
				{subscriptions.map((sub) => (
					<SubscriptionRow
						key={`${sub.plan_id}-${sub.started_at}`}
						subscription={sub}
					/>
				))}
			</Box>
		</Box>
	);
}

function SubscriptionRow({ subscription }: { subscription: ApiSubscription }) {
	const planName = subscription.plan?.name ?? subscription.plan_id;
	const statusColor = getStatusColor(
		subscription.status,
		subscription.past_due,
	);

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={statusColor}>{getStatusIcon(subscription.status)} </Text>
				<Text bold>{planName}</Text>
				{subscription.add_on && <Text dimColor> (add-on)</Text>}
				{subscription.default && <Text color="cyan"> (default)</Text>}
			</Box>
			<Box paddingLeft={2} flexDirection="column">
				<Text dimColor>
					Status: <Text color={statusColor}>{subscription.status}</Text>
					{subscription.past_due && <Text color="red"> (past due)</Text>}
				</Text>
				{subscription.trial_ends_at && (
					<Text dimColor>
						Trial ends: {formatDate(subscription.trial_ends_at)}
					</Text>
				)}
				{subscription.current_period_end && (
					<Text dimColor>
						Period ends: {formatDate(subscription.current_period_end)}
					</Text>
				)}
				{subscription.expires_at && (
					<Text dimColor>Expires: {formatDate(subscription.expires_at)}</Text>
				)}
				{subscription.canceled_at && (
					<Text color="yellow" dimColor>
						Canceled: {formatDate(subscription.canceled_at)}
					</Text>
				)}
			</Box>
		</Box>
	);
}

function getStatusColor(status: string, pastDue: boolean): string {
	if (pastDue) return "red";
	switch (status) {
		case "active":
			return "green";
		case "scheduled":
			return "cyan";
		case "expired":
			return "gray";
		default:
			return "white";
	}
}

function getStatusIcon(status: string): string {
	switch (status) {
		case "active":
			return "●";
		case "scheduled":
			return "○";
		case "expired":
			return "○";
		default:
			return "○";
	}
}
