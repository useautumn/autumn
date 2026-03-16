import { Box, Text } from "ink";
import type { ApiDiscount, ApiRewards } from "../../types.js";

export interface RewardsSectionProps {
	rewards: ApiRewards | null | undefined;
}

/**
 * Renders customer rewards/discounts
 */
export function RewardsSection({ rewards }: RewardsSectionProps) {
	const discounts = rewards?.discounts ?? [];

	if (discounts.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="gray">
					Rewards
				</Text>
				<Text dimColor>No active rewards</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold color="gray">
				Rewards ({discounts.length})
			</Text>
			<Box flexDirection="column" paddingLeft={1}>
				{discounts.map((discount) => (
					<DiscountRow key={discount.id} discount={discount} />
				))}
			</Box>
		</Box>
	);
}

function DiscountRow({ discount }: { discount: ApiDiscount }) {
	const valueDisplay = formatDiscountValue(discount);

	return (
		<Box>
			<Text color="green">● </Text>
			<Text>{discount.name}</Text>
			<Text dimColor> - </Text>
			<Text color="cyan">{valueDisplay}</Text>
			{discount.duration_type !== "forever" && (
				<Text dimColor> ({discount.duration_type})</Text>
			)}
		</Box>
	);
}

function formatDiscountValue(discount: ApiDiscount): string {
	switch (discount.type) {
		case "percentage_discount":
			return `${discount.discount_value}% off`;
		case "fixed_discount": {
			const amount = discount.discount_value / 100;
			return `$${amount.toFixed(2)} off`;
		}
		case "free_product":
			return "Free product";
		case "invoice_credits":
			return `$${(discount.discount_value / 100).toFixed(2)} credits`;
		default:
			return `${discount.discount_value}`;
	}
}
