import { Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ApiBalance, CustomerSheetProps } from "../types.js";
import { formatDate } from "../types.js";
import {
	BalancesSection,
	EntitiesSection,
	InvoicesSection,
	ReferralsSection,
	RewardsSection,
	SubscriptionsSection,
} from "./sections/index.js";

/**
 * Customer detail sheet (right panel).
 * Shows basic info immediately, then lazy-loads expanded data.
 */
export function CustomerSheet({
	customer,
	isFocused,
	copiedFeedback,
	onCopy: _onCopy,
	onOpenInBrowser: _onOpenInBrowser,
	expandedCustomer,
	isLoadingExpanded,
	expandedError,
}: CustomerSheetProps) {
	const borderColor = isFocused ? "magenta" : "gray";

	// Use expanded data if available, otherwise fall back to basic
	const displayCustomer = expandedCustomer ?? customer;

	// Title: Name > ID > Email
	const title =
		displayCustomer.name ||
		displayCustomer.id ||
		displayCustomer.email ||
		"Unknown";

	// Get balances (converted to proper type if expanded)
	const balances = expandedCustomer?.balances ?? {};

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={borderColor}
			paddingX={1}
			minWidth={44}
			height="100%"
		>
			{/* Customer Title */}
			<Text bold color="white">
				{title}
			</Text>

			{/* Basic Customer Info */}
			<Box flexDirection="column" marginTop={1}>
				<Text>
					<Text color="gray">ID: </Text>
					<Text>{displayCustomer.id}</Text>
				</Text>
				<Text>
					<Text color="gray">Name: </Text>
					<Text>{displayCustomer.name ?? "-"}</Text>
				</Text>
				<Text>
					<Text color="gray">Email: </Text>
					<Text>{displayCustomer.email ?? "-"}</Text>
				</Text>
				<Text>
					<Text color="gray">Created: </Text>
					<Text>{formatDate(displayCustomer.created_at)}</Text>
				</Text>
				<Text>
					<Text color="gray">Env: </Text>
					<Text color={displayCustomer.env === "live" ? "green" : "yellow"}>
						{displayCustomer.env}
					</Text>
				</Text>
				{displayCustomer.stripe_id && (
					<Text>
						<Text color="gray">Stripe: </Text>
						<Text dimColor>{displayCustomer.stripe_id}</Text>
					</Text>
				)}
			</Box>

			{/* Loading state for expanded data */}
			{isLoadingExpanded && (
				<Box marginTop={1}>
					<Spinner label="Loading details..." />
				</Box>
			)}

			{/* Error state for expanded data */}
			{expandedError && (
				<Box marginTop={1}>
					<Text color="red">Failed to load details</Text>
				</Box>
			)}

			{/* Expanded sections (only show when data is loaded) */}
			{expandedCustomer && (
				<Box flexDirection="column" marginTop={1}>
					{/* Subscriptions - always at top */}
					<SubscriptionsSection
						subscriptions={expandedCustomer.subscriptions}
						title="Subscriptions"
					/>

					{/* Scheduled Subscriptions */}
					{expandedCustomer.scheduled_subscriptions.length > 0 && (
						<Box marginTop={1}>
							<SubscriptionsSection
								subscriptions={expandedCustomer.scheduled_subscriptions}
								title="Scheduled"
							/>
						</Box>
					)}

					{/* Feature Balances */}
					<Box marginTop={1}>
						<BalancesSection
							balances={balances as Record<string, ApiBalance>}
						/>
					</Box>

					{/* Entities */}
					{expandedCustomer.entities &&
						expandedCustomer.entities.length > 0 && (
							<Box marginTop={1}>
								<EntitiesSection entities={expandedCustomer.entities} />
							</Box>
						)}

					{/* Invoices */}
					{expandedCustomer.invoices &&
						expandedCustomer.invoices.length > 0 && (
							<Box marginTop={1}>
								<InvoicesSection invoices={expandedCustomer.invoices} />
							</Box>
						)}

					{/* Rewards */}
					{expandedCustomer.rewards &&
						expandedCustomer.rewards.discounts.length > 0 && (
							<Box marginTop={1}>
								<RewardsSection rewards={expandedCustomer.rewards} />
							</Box>
						)}

					{/* Referrals */}
					{expandedCustomer.referrals &&
						expandedCustomer.referrals.length > 0 && (
							<Box marginTop={1}>
								<ReferralsSection referrals={expandedCustomer.referrals} />
							</Box>
						)}
				</Box>
			)}

			{/* Basic subscriptions (fallback when expanded not loaded) */}
			{!expandedCustomer && !isLoadingExpanded && (
				<Box marginTop={1} flexDirection="column">
					<Text bold color="gray">
						Subscriptions
					</Text>
					{(customer.subscriptions as unknown[]).length > 0 ? (
						(
							customer.subscriptions as Array<{
								plan_id?: string;
								status?: string;
							}>
						)
							.slice(0, 5)
							.map((sub, i) => (
								<Text key={sub.plan_id ?? i}>
									<Text color="gray">- </Text>
									<Text>{sub.plan_id || "Unknown"}</Text>
									{sub.status && (
										<Text color={sub.status === "active" ? "green" : "yellow"}>
											{" "}
											({sub.status})
										</Text>
									)}
								</Text>
							))
					) : (
						<Text dimColor>No subscriptions</Text>
					)}
				</Box>
			)}

			{/* Spacer to push actions to bottom */}
			<Box flexGrow={1} />

			{/* Actions - pinned to bottom */}
			<Box flexDirection="column">
				{copiedFeedback ? (
					<Text color="green">Copied!</Text>
				) : (
					<Text>
						<Text color="magenta">[c]</Text>
						<Text color="gray"> Copy ID</Text>
					</Text>
				)}
				<Text>
					<Text color="magenta">[o]</Text>
					<Text color="gray"> Open in Autumn</Text>
				</Text>
			</Box>
		</Box>
	);
}
