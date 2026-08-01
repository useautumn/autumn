import { Button } from "@autumn/ui";
import {
	BillingFooter,
	BillingFooterButton,
} from "@/components/forms/shared/BillingFooter";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function UncancelFooter() {
	const { isPending, previewQuery, handleConfirm, form, formValues } =
		useUpdateSubscriptionFormContext();

	const isCancelMode = formValues.cancelAction === "cancel_immediately";
	const isReady = !previewQuery.isLoading && !previewQuery.error;

	const handleCancelImmediatelyClick = () => {
		form.setFieldValue("cancelAction", "cancel_immediately");
		form.setFieldValue("billingBehavior", "prorate_immediately");
	};

	const handleGoBack = () => {
		form.setFieldValue("cancelAction", "uncancel");
		form.setFieldValue("billingBehavior", null);
		form.setFieldValue("refundBehavior", null);
		form.setFieldValue("refundAmount", null);
		form.setFieldValue("noBillingChanges", false);
	};

	return (
		<BillingFooter layout="split" isReady={isReady} reveal>
			<BillingFooterButton>
				<Button
					variant={isCancelMode ? "secondary" : "destructive"}
					className="w-full"
					onClick={isCancelMode ? handleGoBack : handleCancelImmediatelyClick}
					disabled={isPending}
				>
					{isCancelMode ? "Go Back" : "Cancel Immediately"}
				</Button>
			</BillingFooterButton>
			<BillingFooterButton>
				<Button
					variant={isCancelMode ? "destructive" : "primary"}
					className="w-full"
					onClick={handleConfirm}
					isLoading={isPending}
				>
					{isCancelMode ? "Confirm Cancellation" : "Uncancel Subscription"}
				</Button>
			</BillingFooterButton>
		</BillingFooter>
	);
}
