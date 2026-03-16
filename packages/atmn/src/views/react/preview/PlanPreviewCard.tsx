import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text } from "ink";
import type { PlanPreview } from "../../../commands/preview/previewPlan.js";

// Border + padding overhead for width calculations
const BORDER_PADDING_OVERHEAD = 6;

interface PlanPreviewCardProps {
	preview: PlanPreview;
	width: number;
}

/**
 * Calculate the width needed for a plan preview card
 */
export function calculatePlanPreviewWidth(preview: PlanPreview): number {
	let maxWidth = preview.name.length;

	// Check combined price + trial line width (shown on same line with " · " separator)
	if (preview.basePrice && preview.freeTrial) {
		const combinedWidth = preview.basePrice.length + 3 + preview.freeTrial.length;
		maxWidth = Math.max(maxWidth, combinedWidth);
	} else {
		if (preview.basePrice) {
			maxWidth = Math.max(maxWidth, preview.basePrice.length);
		}
		if (preview.freeTrial) {
			maxWidth = Math.max(maxWidth, preview.freeTrial.length);
		}
	}

	// Check feature lines (with tree prefixes)
	for (const feature of preview.features) {
		// "├─ " or "└─ " = 3 chars
		const featureLineWidth = 3 + feature.primary_text.length;
		maxWidth = Math.max(maxWidth, featureLineWidth);

		// Check secondary text if present
		if (feature.secondary_text) {
			// "│  " or "   " = 3 chars
			const secondaryWidth = 3 + feature.secondary_text.length;
			maxWidth = Math.max(maxWidth, secondaryWidth);
		}

		// Check tier details if present
		if (feature.tier_details) {
			for (const tier of feature.tier_details) {
				// "│  ├─ " or "   └─ " = 6 chars
				const tierWidth = 6 + tier.length;
				maxWidth = Math.max(maxWidth, tierWidth);
			}
		}
	}

	return maxWidth + BORDER_PADDING_OVERHEAD;
}

/**
 * Individual plan card with titled border (title embedded in border)
 */
export function PlanPreviewCard({ preview, width }: PlanPreviewCardProps) {
	const featureCount = preview.features.length;

	return (
		<TitledBox
			titles={[preview.name]}
			borderStyle="round"
			borderColor="magenta"
			width={width}
			paddingX={1}
			paddingY={0}
		>
			<Box flexDirection="column">
				{/* Base price and/or free trial (same line with · separator) */}
				{(preview.basePrice || preview.freeTrial) && (
					<Text>
						{preview.basePrice && (
							<Text color="green" bold>{preview.basePrice}</Text>
						)}
						{preview.basePrice && preview.freeTrial && (
							<Text dimColor> · </Text>
						)}
						{preview.freeTrial && (
							<Text color="cyan">{preview.freeTrial}</Text>
						)}
					</Text>
				)}

				{/* Features with tree-style formatting */}
				{featureCount > 0 && (
					<Box flexDirection="column">
						{preview.features.map((feature, i) => {
							const isLastFeature = i === featureCount - 1;
							const featurePrefix = isLastFeature ? "\u2514\u2500" : "\u251C\u2500"; // "└─" or "├─"
							const continuationPrefix = isLastFeature ? "   " : "\u2502  "; // "   " or "│  "

							return (
								<Box key={`${preview.name}-feature-${feature.primary_text}`} flexDirection="column">
									{/* Primary feature text */}
									<Text>
										<Text dimColor>{featurePrefix}</Text>
										<Text> {feature.primary_text}</Text>
									</Text>

									{/* Secondary text if present */}
									{feature.secondary_text && (
										<Text>
											<Text dimColor>{continuationPrefix}</Text>
											<Text>{feature.secondary_text}</Text>
										</Text>
									)}

									{/* Tier details as sub-tree */}
									{feature.tier_details && feature.tier_details.length > 0 && (
										<Box flexDirection="column">
											{feature.tier_details.map((tierDetail, j) => {
												const isLastTier = j === feature.tier_details!.length - 1;
												const tierPrefix = isLastTier ? "\u2514\u2500" : "\u251C\u2500"; // "└─" or "├─"

												return (
													<Text key={`${preview.name}-${feature.primary_text}-tier-${tierDetail}`}>
														<Text dimColor>{continuationPrefix}{tierPrefix}</Text>
														<Text> {tierDetail}</Text>
													</Text>
												);
											})}
										</Box>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</Box>
		</TitledBox>
	);
}
