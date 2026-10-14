import { Box, Text } from "ink";
import type { ApiPlan } from "../../../../lib/api/types/index.js";
import { formatDate, SheetSection } from "../../primitives/index.js";

export interface ProductSheetProps {
	plan: ApiPlan;
	isFocused: boolean;
	copiedFeedback: boolean;
	onCopy: () => void;
	onOpenInBrowser: () => void;
}

export function ProductSheet({
	plan,
	isFocused,
	copiedFeedback,
	onCopy: _onCopy,
	onOpenInBrowser: _onOpenInBrowser,
}: ProductSheetProps) {
	const borderColor = isFocused ? "magenta" : "gray";

	const planType = plan.add_on ? "Add-on" : plan.auto_enable ? "Default" : "Plan";

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={borderColor}
			paddingX={1}
			minWidth={44}
			height="100%"
		>
			<Text bold color="white">
				{plan.name}
			</Text>

			<SheetSection title="Basic Info">
				<Text>
					<Text color="gray">ID: </Text>
					<Text>{plan.id}</Text>
				</Text>
				<Text>
					<Text color="gray">Name: </Text>
					<Text>{plan.name}</Text>
				</Text>
				{plan.description && (
					<Text>
						<Text color="gray">Description: </Text>
						<Text>{plan.description}</Text>
					</Text>
				)}
				{plan.group && (
					<Text>
						<Text color="gray">Group: </Text>
						<Text>{plan.group}</Text>
					</Text>
				)}
				<Text>
					<Text color="gray">Version: </Text>
					<Text>v{plan.version}</Text>
				</Text>
				<Text>
					<Text color="gray">Type: </Text>
					<Text>{planType}</Text>
				</Text>
				<Text>
					<Text color="gray">Env: </Text>
					<Text color={plan.env === "live" ? "green" : "yellow"}>
						{plan.env}
					</Text>
				</Text>
				<Text>
					<Text color="gray">Status: </Text>
					<Text color={plan.archived ? "red" : "green"}>
						{plan.archived ? "Archived" : "Active"}
					</Text>
				</Text>
				<Text>
					<Text color="gray">Created: </Text>
					<Text>{formatDate(plan.created_at)}</Text>
				</Text>
			</SheetSection>

			{plan.price && (
				<SheetSection title="Price">
					<Text>
						<Text color="gray">Amount: </Text>
						<Text color="green">${plan.price.amount.toFixed(2)}</Text>
					</Text>
					<Text>
						<Text color="gray">Interval: </Text>
						<Text>
							{plan.price.interval}
							{plan.price.interval_count && plan.price.interval_count > 1
								? ` (every ${plan.price.interval_count})`
								: ""}
						</Text>
					</Text>
				</SheetSection>
			)}

			{!plan.price && (
				<SheetSection title="Price">
					<Text color="cyan">Free</Text>
				</SheetSection>
			)}

			{plan.free_trial && (
				<SheetSection title="Free Trial">
					<Text>
						<Text color="gray">Duration Type: </Text>
						<Text>{plan.free_trial.duration_type}</Text>
					</Text>
					<Text>
						<Text color="gray">Duration Length: </Text>
						<Text>{plan.free_trial.duration_length}</Text>
					</Text>
					<Text>
						<Text color="gray">Card Required: </Text>
						<Text color={plan.free_trial.card_required ? "yellow" : "green"}>
							{plan.free_trial.card_required ? "Yes" : "No"}
						</Text>
					</Text>
				</SheetSection>
			)}

			<SheetSection
				title={`Items (${plan.items.length})`}
				isEmpty={plan.items.length === 0}
				emptyMessage="No items"
			>
				{plan.items.slice(0, 10).map((feature: { feature_id: string; unlimited?: boolean; included?: number | null; reset?: { interval: string; interval_count?: number | null } | null; price?: { amount?: number; interval?: string | null } | null }, index: number) => (
					<Box key={feature.feature_id} flexDirection="column">
						<Text>
							<Text color="gray">{index + 1}. </Text>
							<Text bold>{feature.feature_id}</Text>
						</Text>
						<Box paddingLeft={2} flexDirection="column">
							<Text>
								<Text color="gray">Balance: </Text>
								{feature.unlimited ? (
									<Text color="cyan">Unlimited</Text>
								) : (
									<Text>{feature.included}</Text>
								)}
							</Text>
							{feature.reset && (
								<Text>
									<Text color="gray">Reset: </Text>
									<Text>
										{feature.reset.interval}
										{feature.reset.interval_count &&
										feature.reset.interval_count > 1
											? ` (every ${feature.reset.interval_count})`
											: ""}
									</Text>
								</Text>
							)}
							{feature.price && (
								<Text>
									<Text color="gray">Usage Price: </Text>
									<Text color="green">
										{feature.price.amount !== undefined
											? `$${feature.price.amount.toFixed(2)}`
											: "Tiered"}
										/{feature.price.interval}
									</Text>
								</Text>
							)}
						</Box>
					</Box>
				))}
				{plan.items.length > 10 && (
					<Text dimColor>... and {plan.items.length - 10} more</Text>
				)}
			</SheetSection>

			<Box flexGrow={1} />

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
