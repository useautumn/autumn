import { Box, Text } from "ink";
import type { TemplateTier } from "./data.js";

export interface PlanCardProps {
	tier: TemplateTier;
	index: number;
	width?: number;
}

// Rotate through plan name colors - terminal-native colors
const PLAN_COLORS = ["yellow", "green", "cyan", "magenta"] as const;

/**
 * Calculate the width needed for a plan card
 */
export function calculatePlanWidth(tier: TemplateTier): number {
	const titleWidth = tier.name.length;
	const priceWidth = tier.price.length;
	const maxFeatureWidth = Math.max(...tier.features.map((f) => f.length + 2)); // +2 for "• "
	// Add padding (2 on each side) + border (2)
	return Math.max(titleWidth, priceWidth, maxFeatureWidth) + 6;
}

/**
 * Individual plan card with border box
 */
export function PlanCard({ tier, index, width }: PlanCardProps) {
	const titleColor = PLAN_COLORS[index % PLAN_COLORS.length];

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="gray"
			paddingX={1}
			paddingY={0}
			width={width}
		>
			<Box flexDirection="row" justifyContent="space-between">
				<Text color={titleColor} bold>
					{tier.name}
				</Text>
				<Text color="green">{tier.price}</Text>
			</Box>
			<Box flexDirection="column">
				{tier.features.map((feature, idx) => (
					<Text key={`${tier.name}-${idx}`} dimColor>
						{"• "}
						{feature}
					</Text>
				))}
			</Box>
		</Box>
	);
}
