import type { AxiosError } from "axios";
import { format } from "date-fns";
import { motion } from "motion/react";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LAYOUT_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachPreviewSection() {
	const { previewQuery, formValues } = useAttachFormContext();

	const hasProductSelected = !!formValues.productId;

	const { isLoading, data: previewData, error: queryError } = previewQuery;
	const error = queryError
		? getBackendErr(queryError as AxiosError, "Failed to load preview")
		: undefined;

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

	if (!hasProductSelected) return null;

	if (error) {
		return (
			<motion.div layout transition={LAYOUT_TRANSITION}>
				<SheetSection title="Pricing Preview" withSeparator>
					<PreviewErrorDisplay error={error} />
				</SheetSection>
			</motion.div>
		);
	}

	return (
		<motion.div layout transition={LAYOUT_TRANSITION}>
			<LineItemsPreview
				title="Pricing Preview"
				isLoading={isLoading}
				lineItems={previewData?.line_items}
				currency={previewData?.currency}
				totals={totals}
				filterZeroAmounts
			/>
		</motion.div>
	);
}
