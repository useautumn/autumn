import type { AxiosError } from "axios";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { useCancelSubscriptionContext } from "../context/CancelSubscriptionContext";

export function CancelPreviewSection() {
	const { previewQuery, cancelAction } = useCancelSubscriptionContext();

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

	const totals = useMemo(() => {
		if (!previewData) return [];

		const result = [];

		const totalLabel =
			previewData.total < 0 ? "Credit/Refund Amount" : "Total Due Now";

		result.push({
			label: totalLabel,
			amount: previewData.total,
			variant: "primary" as const,
		});

		if (previewData.next_cycle && cancelAction === "cancel_end_of_cycle") {
			result.push({
				label: "Next Cycle",
				amount: previewData.next_cycle.total,
				variant: "secondary" as const,
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}

		return result;
	}, [previewData, cancelAction]);

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={cancelAction}
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
		</AnimatePresence>
	);
}
