import { TitledBox } from "@mishieck/ink-titled-box";
import { Box, Text } from "ink";
import type { PlanPreview } from "../../../commands/preview/previewPlan.js";

const BORDER_PADDING_OVERHEAD = 6;

interface PlanPreviewCardProps {
	preview: PlanPreview;
	width: number;
}

export function calculatePlanPreviewWidth(preview: PlanPreview): number {
	let maxWidth = preview.name.length;

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

	for (const feature of preview.features) {
		const featureLineWidth = 3 + feature.primary_text.length;
		maxWidth = Math.max(maxWidth, featureLineWidth);

		if (feature.secondary_text) {
			const secondaryWidth = 3 + feature.secondary_text.length;
			maxWidth = Math.max(maxWidth, secondaryWidth);
		}

		if (feature.tier_details) {
			for (const tier of feature.tier_details) {
				const tierWidth = 6 + tier.length;
				maxWidth = Math.max(maxWidth, tierWidth);
			}
		}
	}

	return maxWidth + BORDER_PADDING_OVERHEAD;
}

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

				{featureCount > 0 && (
					<Box flexDirection="column">
						{preview.features.map((feature, i) => {
							const isLastFeature = i === featureCount - 1;
							const featurePrefix = isLastFeature ? "\u2514\u2500" : "\u251C\u2500";
							const continuationPrefix = isLastFeature ? "   " : "\u2502  ";

							return (
								<Box key={`${preview.name}-feature-${feature.primary_text}`} flexDirection="column">
									<Text>
										<Text dimColor>{featurePrefix}</Text>
										<Text> {feature.primary_text}</Text>
									</Text>

									{feature.secondary_text && (
										<Text>
											<Text dimColor>{continuationPrefix}</Text>
											<Text>{feature.secondary_text}</Text>
										</Text>
									)}

									{feature.tier_details && feature.tier_details.length > 0 && (
										<Box flexDirection="column">
											{feature.tier_details.map((tierDetail, j) => {
												const isLastTier = j === feature.tier_details!.length - 1;
												const tierPrefix = isLastTier ? "\u2514\u2500" : "\u251C\u2500";

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
