import type { SetPlansErrorAction } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useMemo } from "react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { previewErrorToSetPlansErrorCopy } from "../utils/previewErrorToSetPlansErrorCopy";
import { SetPlansErrorAlert } from "./errors/SetPlansErrorAlert";

export function SchedulePreview() {
	const { preview, isPreviewLoading, error, lineEdits } =
		useCreateScheduleFormContext();
	const { subscriptionLinks } = useCustomerStateContext();

	const previewQuery = useMemo(
		() => ({ data: preview, isLoading: isPreviewLoading, error }),
		[preview, isPreviewLoading, error],
	);
	const errorCopy = previewErrorToSetPlansErrorCopy(error);

	if (errorCopy) {
		const runAction = (action: SetPlansErrorAction) =>
			action.type === "open_subscription"
				? subscriptionLinks?.open(action.stripeSubscriptionId)
				: subscriptionLinks?.pick();
		return (
			<SheetSection title="Pricing Preview" withSeparator={false}>
				<div className="flex flex-col gap-2">
					<SetPlansErrorAlert
						copy={errorCopy}
						onAction={subscriptionLinks ? runAction : undefined}
					/>
					{lineEdits.hasEdits && (
						<div>
							<Button onClick={lineEdits.clear} size="sm" variant="secondary">
								Clear line edits
							</Button>
						</div>
					)}
				</div>
			</SheetSection>
		);
	}

	return <PreviewSection previewQuery={previewQuery} lineEdits={lineEdits} />;
}
