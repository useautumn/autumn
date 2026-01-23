import { CusProductStatus } from "@autumn/shared";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

export function CancelFooter() {
	const { isPending, previewQuery, handleConfirm, formContext } =
		useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const isScheduled = customerProduct.status === CusProductStatus.Scheduled;
	const isDefault = customerProduct.product.is_default;

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;

	if (isLoading || hasError) return null;

	const buttonLabel = isScheduled
		? "Cancel Scheduled Plan"
		: isDefault
			? "Cancel Default Plan"
			: "Cancel Subscription";

	return (
		<SheetFooter className="grid-cols-1">
			<Button
				variant="destructive"
				className="w-full"
				onClick={handleConfirm}
				isLoading={isPending}
			>
				{buttonLabel}
			</Button>
		</SheetFooter>
	);
}
