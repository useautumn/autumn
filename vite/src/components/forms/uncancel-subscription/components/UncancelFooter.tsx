import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

export function UncancelFooter() {
	const { isPending, previewQuery, handleConfirm } =
		useUpdateSubscriptionFormContext();

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;

	if (isLoading || hasError) return null;

	return (
		<SheetFooter className="grid-cols-1">
			<Button
				variant="primary"
				className="w-full"
				onClick={handleConfirm}
				isLoading={isPending}
			>
				Uncancel Subscription
			</Button>
		</SheetFooter>
	);
}
