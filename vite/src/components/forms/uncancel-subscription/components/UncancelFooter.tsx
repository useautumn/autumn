import { type ReactNode, useEffect, useState } from "react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

const FOOTER_DELAY_MS = 350;

function FooterButton({ children }: { children: ReactNode }) {
	return <div className="animate-in fade-in duration-200">{children}</div>;
}

export function UncancelFooter() {
	const { isPending, previewQuery, handleConfirm, form, formValues } =
		useUpdateSubscriptionFormContext();

	const isCancelMode = formValues.cancelAction === "cancel_immediately";

	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const isReady = !isLoading && !hasError;

	const [showFooter, setShowFooter] = useState(false);

	useEffect(() => {
		if (isReady) {
			const timer = setTimeout(() => setShowFooter(true), FOOTER_DELAY_MS);
			return () => clearTimeout(timer);
		}
		setShowFooter(false);
	}, [isReady]);

	const handleCancelImmediatelyClick = () => {
		form.setFieldValue("cancelAction", "cancel_immediately");
		form.setFieldValue("billingBehavior", "prorate_immediately");
	};

	const handleGoBack = () => {
		form.setFieldValue("cancelAction", "uncancel");
	};

	if (!showFooter) return null;

	if (isCancelMode) {
		return (
			<SheetFooter className="grid-cols-2">
				<FooterButton>
					<Button
						variant="secondary"
						className="w-full"
						onClick={handleGoBack}
						disabled={isPending}
					>
						Go Back
					</Button>
				</FooterButton>
				<FooterButton>
					<Button
						variant="destructive"
						className="w-full"
						onClick={handleConfirm}
						isLoading={isPending}
					>
						Confirm Cancellation
					</Button>
				</FooterButton>
			</SheetFooter>
		);
	}

	return (
		<SheetFooter className="grid-cols-2">
			<FooterButton>
				<Button
					variant="destructive"
					className="w-full"
					onClick={handleCancelImmediatelyClick}
					disabled={isPending}
				>
					Cancel Immediately
				</Button>
			</FooterButton>
			<FooterButton>
				<Button
					variant="primary"
					className="w-full"
					onClick={handleConfirm}
					isLoading={isPending}
				>
					Uncancel Subscription
				</Button>
			</FooterButton>
		</SheetFooter>
	);
}
