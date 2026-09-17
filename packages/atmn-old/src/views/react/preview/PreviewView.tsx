import { Box } from "ink";
import { useMemo } from "react";
import type { Feature, Plan } from "../../../compose/index.js";
import { getPlanPreview, type PlanPreview } from "../../../commands/preview/previewPlan.js";
import { calculatePlanPreviewWidth, PlanPreviewCard } from "./PlanPreviewCard.js";

const MIN_CARD_WIDTH = 40;

interface PreviewViewProps {
	plans: Plan[];
	features: Feature[];
	currency?: string;
}

/**
 * Preview view displaying all plans in titled cards with matching widths
 */
export function PreviewView({
	plans,
	features,
	currency = "USD",
}: PreviewViewProps) {
	// Generate previews for all plans
	const previews: PlanPreview[] = useMemo(() => {
		return plans.map((plan) =>
			getPlanPreview({ plan, features, currency })
		);
	}, [plans, features, currency]);

	// Calculate the maximum width needed across all cards
	const sharedWidth = useMemo(() => {
		let maxWidth = MIN_CARD_WIDTH;
		for (const preview of previews) {
			const width = calculatePlanPreviewWidth(preview);
			if (width > maxWidth) {
				maxWidth = width;
			}
		}
		return maxWidth;
	}, [previews]);

	return (
		<Box flexDirection="column" gap={1}>
			{previews.map((preview) => (
				<PlanPreviewCard
					key={preview.name}
					preview={preview}
					width={sharedWidth}
				/>
			))}
		</Box>
	);
}
