import { CusProductStatus, cp } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { BillingFooter } from "@/components/forms/shared/BillingFooter";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";

export function CancelFooter() {
	const { isPending, previewQuery, handleConfirm, formContext } =
		useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const isDefault = customerProduct.product?.is_default ?? false;
	const { valid: isFreeOrOneOff } = cp(customerProduct).free().or.oneOff();
	const isFreeDefault = isDefault && isFreeOrOneOff;

	const isReady = !previewQuery.isLoading && !previewQuery.error;

	let buttonLabel = "Cancel Subscription";
	if (isScheduled) {
		buttonLabel = "Cancel Scheduled Plan";
	} else if (isFreeDefault) {
		buttonLabel = "Cancel Default Plan";
	}

	return (
		<BillingFooter layout="single" isReady={isReady} reveal>
			<Button
				variant="destructive"
				className="w-full"
				onClick={handleConfirm}
				isLoading={isPending}
			>
				{buttonLabel}
			</Button>
		</BillingFooter>
	);
}
