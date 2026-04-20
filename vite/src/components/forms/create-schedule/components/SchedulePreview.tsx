import { AxiosError } from "axios";
import { format } from "date-fns";
import { PreviewErrorDisplay } from "@/components/forms/update-subscription-v2/components/PreviewErrorDisplay";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { getBackendErr } from "@/utils/genUtils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function SchedulePreview() {
	const {
		preview,
		isPreviewLoading,
		error: queryError,
	} = useCreateScheduleFormContext();

	const error = !queryError
		? undefined
		: queryError instanceof AxiosError
			? getBackendErr(queryError, "Failed to load preview")
			: queryError instanceof Error
				? queryError.message
				: "Failed to load preview";

	const totals = [];

	if (preview) {
		totals.push({
			label: "Total Due Now",
			amount: Math.max(preview.total, 0),
			variant: "primary" as const,
		});

		if (preview.next_cycle) {
			totals.push({
				label: "Next Cycle",
				amount: preview.next_cycle.total,
				variant: "secondary" as const,
				badge: preview.next_cycle.starts_at
					? format(new Date(preview.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}
	}

	if (error) {
		return (
			<SheetSection title="Pricing Preview" withSeparator>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	return (
		<LineItemsPreview
			title="Pricing Preview"
			withSeparator
			isLoading={isPreviewLoading}
			lineItems={preview?.line_items}
			currency={preview?.currency}
			totals={totals}
			filterZeroAmounts
		/>
	);
}
