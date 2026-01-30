import type { CheckoutChange, ConfirmCheckoutResponse } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import autumnLogo from "@/assets/autumn.svg";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { CheckoutErrorState } from "@/components/checkout/CheckoutErrorState";
import { CheckoutLoadingState } from "@/components/checkout/CheckoutLoadingState";
import { CheckoutSuccessState } from "@/components/checkout/CheckoutSuccessState";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { PlanSelectionCard } from "@/components/checkout/PlanSelectionCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	useCheckout,
	useConfirmCheckout,
	usePreviewCheckout,
} from "@/hooks/useCheckout";
import { formatAmount } from "@/utils/formatUtils";

function buildOptionsArray(
	incoming: CheckoutChange[],
	quantities: Record<string, number>,
): { feature_id: string; quantity: number }[] {
	const options: { feature_id: string; quantity: number }[] = [];

	for (const change of incoming) {
		for (const fq of change.feature_quantities) {
			const quantity = quantities[fq.feature_id] ?? fq.quantity;
			options.push({
				feature_id: fq.feature_id,
				quantity,
			});
		}
	}

	return options;
}

export function CheckoutPage() {
	const { checkoutId: checkoutIdParam } = useParams<{ checkoutId: string }>();
	const checkoutId = checkoutIdParam ?? "";
	const [confirmResult, setConfirmResult] =
		useState<ConfirmCheckoutResponse | null>(null);

	// Local quantity overrides for optimistic UI
	const [quantities, setQuantities] = useState<Record<string, number>>({});

	const { data: checkoutData, isLoading, error } = useCheckout({ checkoutId });
	const previewMutation = usePreviewCheckout({ checkoutId });
	const confirmMutation = useConfirmCheckout({ checkoutId });

	// Debounced preview update
	const debouncedPreview = useDebouncedCallback(
		(options: { feature_id: string; quantity: number }[]) => {
			previewMutation.mutate(options);
		},
		300,
	);

	const handleQuantityChange = useCallback(
		(featureId: string, quantity: number, _billingUnits: number) => {
			// Update local state immediately for optimistic UI
			// Quantity is in actual units (e.g., 500 messages), which is what the API expects
			setQuantities((prev) => ({ ...prev, [featureId]: quantity }));

			// Build options and trigger debounced preview
			if (checkoutData) {
				const newQuantities = { ...quantities, [featureId]: quantity };
				const options = buildOptionsArray(checkoutData.incoming, newQuantities);
				debouncedPreview(options);
			}
		},
		[checkoutData, quantities, debouncedPreview],
	);

	const handleConfirm = () => {
		confirmMutation.mutate(undefined, {
			onSuccess: (result) => {
				setConfirmResult(result);
			},
		});
	};

	// Get first incoming plan name for order summary
	const primaryPlanName = useMemo(() => {
		if (!checkoutData?.incoming?.length) return "Order";
		return checkoutData.incoming[0].plan.name || "Order";
	}, [checkoutData]);

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

	const { preview, incoming } = checkoutData;
	const { total, currency } = preview;
	const isUpdating = previewMutation.isPending;

	return (
		<CheckoutBackground>
			<div className="flex flex-col gap-8">
				{/* Header */}
				<h1 className="text-2xl font-semibold text-foreground">
					Confirm your order
				</h1>

				{/* Plan selection section - one card per incoming plan */}
				<div className="flex flex-col gap-4">
					{incoming.map((change) => (
						<PlanSelectionCard
							key={change.plan.id}
							change={change}
							currency={currency}
							quantities={quantities}
							onQuantityChange={handleQuantityChange}
						/>
					))}
				</div>

				<Separator />

				{/* Order summary section */}
				<OrderSummary planName={primaryPlanName} preview={preview} />

				<Separator />

				{/* Amount due today */}
				<div className="flex items-center justify-between">
					<span className="text-base font-medium text-foreground">
						Amount due today
					</span>
					<span className="text-lg font-medium text-foreground">
						{formatAmount(total, currency)}
					</span>
				</div>

				{/* Confirm button */}
				<Button
					className="w-full h-12 text-base font-medium rounded-lg"
					onClick={handleConfirm}
					disabled={confirmMutation.isPending || isUpdating}
				>
					{confirmMutation.isPending
						? "Processing..."
						: isUpdating
							? "Updating..."
							: "Confirm purchase"}
				</Button>

				{/* Error message */}
				{confirmMutation.error && (
					<p className="text-sm text-destructive text-center">
						{confirmMutation.error instanceof Error
							? confirmMutation.error.message
							: "Failed to confirm checkout"}
					</p>
				)}

				{/* Footer */}
				<div className="flex items-center justify-center gap-2">
					<span className="text-base text-muted-foreground">Powered by</span>
					<img src={autumnLogo} alt="Autumn" className="h-6 w-6" />
					<span className="text-base font-medium text-foreground">Autumn</span>
				</div>
			</div>
		</CheckoutBackground>
	);
}
