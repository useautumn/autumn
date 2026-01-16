import type { PreviewUpdateSubscriptionResponse } from "@autumn/shared";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";

interface UpdateSubscriptionPreviewSectionProps {
	isLoading: boolean;
	previewData?: PreviewUpdateSubscriptionResponse | null;
	error?: string;
	hasChanges: boolean;
}

export function UpdateSubscriptionPreviewSection({
	isLoading,
	previewData,
	error,
	hasChanges,
}: UpdateSubscriptionPreviewSectionProps) {
	const totals = [];

	if (previewData) {
		totals.push({
			label: "Total Due Now",
			amount: previewData.total,
			variant: "primary" as const,
		});

		if (previewData.next_cycle) {
			totals.push({
				label: "Next Cycle",
				amount: previewData.next_cycle.total,
				variant: "secondary" as const,
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}
	}

	return (
		<AnimatePresence mode="wait">
			{hasChanges && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 20 }}
					transition={SHEET_ANIMATION}
				>
					{error ? (
						<SheetSection title="Pricing Preview" withSeparator>
							<PreviewErrorDisplay error={error} />
						</SheetSection>
					) : (
						<LineItemsPreview
							title="Pricing Preview"
							isLoading={isLoading}
							loadingText="Calculating totals"
							lineItems={previewData?.line_items}
							currency={previewData?.currency}
							totals={totals}
							filterZeroAmounts
						/>
					)}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
