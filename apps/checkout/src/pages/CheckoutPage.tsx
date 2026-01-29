import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckoutErrorState } from "@/components/checkout/CheckoutErrorState";
import { CheckoutLoadingState } from "@/components/checkout/CheckoutLoadingState";
import { CheckoutSuccessState } from "@/components/checkout/CheckoutSuccessState";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCheckout, useConfirmCheckout } from "@/hooks/useCheckout";
import { formatAmount, formatDate } from "@/utils/formatUtils";

export function CheckoutPage() {
	const { checkoutId: checkoutIdParam } = useParams<{ checkoutId: string }>();
	const checkoutId = checkoutIdParam ?? "";
	const [confirmResult, setConfirmResult] =
		useState<ConfirmCheckoutResponse | null>(null);

	const { data: checkoutData, isLoading, error } = useCheckout({ checkoutId });

	const confirmMutation = useConfirmCheckout({ checkoutId });

	const handleConfirm = () => {
		confirmMutation.mutate(undefined, {
			onSuccess: (result) => {
				setConfirmResult(result);
			},
		});
	};

	if (!checkoutId) {
		return <CheckoutErrorState message="Missing checkout ID" />;
	}

	if (isLoading) {
		return <CheckoutLoadingState />;
	}

	if (error) {
		const message =
			error instanceof Error ? error.message : "Failed to load checkout";
		return <CheckoutErrorState message={message} />;
	}

	if (confirmResult) {
		return <CheckoutSuccessState result={confirmResult} />;
	}

	if (!checkoutData) {
		return <CheckoutErrorState message="No checkout data available" />;
	}

	const { preview } = checkoutData;

	console.log("preview:", JSON.stringify(preview, null, 2));

	return (
		<div className="min-h-screen bg-background px-6 py-12 flex items-center justify-center">
			<div className="w-full max-w-lg flex flex-col gap-8">
				{/* Header */}
				<h1 className="text-2xl font-semibold text-foreground">Checkout</h1>

				{/* Line items card */}
				<div className="bg-card border border-border shadow-sm rounded-lg divide-y divide-border">
					{preview.line_items.map((item) => (
						<div
							key={item.description}
							className="flex justify-between items-start gap-4 px-4 py-3.5"
						>
							<div className="flex flex-col gap-0.5">
								<span className="font-medium text-foreground">
									{item.title}
								</span>
								<span className="text-sm text-muted-foreground">
									{item.description}
								</span>
							</div>
							<span className="font-medium tabular-nums shrink-0">
								{formatAmount(item.amount, preview.currency)}
							</span>
						</div>
					))}
				</div>

				<Separator />

				{/* Amount due today */}
				<div className="flex flex-col gap-1">
					<div className="flex justify-between items-center">
						<span className="text-base font-medium text-muted-foreground">
							Amount due today
						</span>
						<span className="text-2xl font-semibold tabular-nums">
							{formatAmount(preview.total, preview.currency)}
						</span>
					</div>
					{preview.next_cycle && (
						<p className="text-sm text-muted-foreground">
							Then {formatAmount(preview.next_cycle.total, preview.currency)}
							/month starting {formatDate(preview.next_cycle.starts_at)}
						</p>
					)}
				</div>

				{/* Button */}
				<div className="pt-4">
					<Button
						className="w-full h-12 text-base rounded-xl"
						onClick={handleConfirm}
						disabled={confirmMutation.isPending}
					>
						{confirmMutation.isPending ? "Processing..." : "Confirm Purchase"}
					</Button>
				</div>

				{confirmMutation.error && (
					<p className="text-sm text-destructive text-center">
						{confirmMutation.error instanceof Error
							? confirmMutation.error.message
							: "Failed to confirm checkout"}
					</p>
				)}
			</div>
		</div>
	);
}
