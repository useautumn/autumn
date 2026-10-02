import type { SetPlansErrorAction } from "@autumn/shared";
import { useMemo } from "react";
import { useCustomerStateContext } from "@/components/forms/customer-state/CustomerStateProvider";
import { PreviewSection } from "@/components/forms/shared/PreviewSection";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { previewErrorToSetPlansErrorCopy } from "../utils/previewErrorToSetPlansErrorCopy";
import { SetPlansErrorAlert } from "./errors/SetPlansErrorAlert";

export function SchedulePreview() {
	const { preview, isPreviewLoading, error } = useCreateScheduleFormContext();
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
				<SetPlansErrorAlert
					copy={errorCopy}
					onAction={subscriptionLinks ? runAction : undefined}
				/>
			</SheetSection>
		);
	}

	return <PreviewSection previewQuery={previewQuery} />;
}
