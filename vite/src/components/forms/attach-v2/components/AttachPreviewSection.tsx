import type { AxiosError } from "axios";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachPreviewSkeleton } from "./AttachPreviewSkeleton";

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
			<motion.div layout="position" transition={{ layout: LAYOUT_TRANSITION }}>
				<SheetSection title="Pricing Preview" withSeparator>
					<PreviewErrorDisplay error={error} />
				</SheetSection>
			</motion.div>
		);
	}

	return (
		<AnimatePresence mode="wait">
			{isLoading ? (
				<motion.div
					key="preview-skeleton"
					layout="position"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{
						opacity: 0,
						transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
					}}
					transition={{
						opacity: { duration: 0.25 },
						layout: LAYOUT_TRANSITION,
					}}
				>
					<AttachPreviewSkeleton />
				</motion.div>
			) : previewData ? (
				<motion.div
					key="preview-content"
					layout="position"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{
						opacity: 0,
						transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
					}}
					transition={{
						opacity: { duration: 0.25, delay: 0.05 },
						layout: LAYOUT_TRANSITION,
					}}
				>
					<LineItemsPreview
						title="Pricing Preview"
						lineItems={previewData.line_items}
						currency={previewData.currency}
						totals={totals}
						filterZeroAmounts
					/>
					{previewData?.redirect_type && (
						<SheetSection withSeparator={false} className="py-0 pb-2">
							<InfoBox variant="note">
								{previewData.redirect_type === "stripe_checkout"
									? "Customer will be redirected to Stripe Checkout to complete payment"
									: "Customer will be redirected to Autumn Checkout to complete payment"}
							</InfoBox>
						</SheetSection>
					)}
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
