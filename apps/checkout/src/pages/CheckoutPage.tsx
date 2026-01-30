import type { CheckoutChange, ConfirmCheckoutResponse } from "@autumn/shared";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { CheckoutErrorState } from "@/components/checkout/CheckoutErrorState";
import { CheckoutFooter } from "@/components/checkout/CheckoutFooter";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { CheckoutSuccessState } from "@/components/checkout/CheckoutSuccessState";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { OrderSummarySkeleton } from "@/components/checkout/OrderSummarySkeleton";
import { PlanSelectionCard } from "@/components/checkout/PlanSelectionCard";
import { PlanSelectionCardSkeleton } from "@/components/checkout/PlanSelectionCardSkeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useCheckout,
	useConfirmCheckout,
	usePreviewCheckout,
} from "@/hooks/useCheckout";
import {
	FAST_TRANSITION,
	STANDARD_TRANSITION,
	fadeUpVariants,
	listContainerVariants,
} from "@/lib/animations";
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
			setQuantities((prev) => ({ ...prev, [featureId]: quantity }));

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

	const primaryPlanName = useMemo(() => {
		if (!checkoutData?.incoming?.length) return "Order";
		return checkoutData.incoming[0].plan.name || "Order";
	}, [checkoutData]);

	const isSubscription = useMemo(() => {
		if (!checkoutData?.incoming?.length) return false;
		return checkoutData.incoming.some((change) => change.plan.price?.interval);
	}, [checkoutData]);

	if (!checkoutId) {
		return <CheckoutErrorState message="Missing checkout ID" />;
	}

	// Handle success and error states with AnimatePresence
	if (confirmResult) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.98 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutSuccessState result={confirmResult} />
			</motion.div>
		);
	}

	if (error) {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutErrorState
					message={
						error instanceof Error ? error.message : "Failed to load checkout"
					}
				/>
			</motion.div>
		);
	}

	// Main checkout view - same structure for loading and loaded states
	const { preview, incoming, outgoing, org } = checkoutData ?? {};
	const currency = preview?.currency ?? "usd";
	const total = preview?.total ?? 0;
	const isUpdating = previewMutation.isPending;

	return (
		<CheckoutBackground>
			<motion.div
				className="flex flex-col gap-8 w-full"
				initial="initial"
				animate="animate"
				variants={listContainerVariants}
			>
				{/* Header */}
				<motion.div variants={fadeUpVariants} transition={STANDARD_TRANSITION}>
					<CheckoutHeader org={org} isLoading={isLoading} />
				</motion.div>

				{/* Main content - two columns */}
				<LayoutGroup>
					<div className="flex flex-col lg:flex-row gap-8 w-full">
						{/* Left column - Plan selection */}
						<motion.div
							className="flex flex-col gap-4 w-full lg:w-1/2"
							variants={fadeUpVariants}
							transition={{ ...STANDARD_TRANSITION, delay: 0.05 }}
						>
							{isLoading ? (
								<PlanSelectionCardSkeleton />
							) : incoming ? (
								incoming.map((change) => (
									<PlanSelectionCard
										key={change.plan.id}
										change={change}
										currency={currency}
										quantities={quantities}
										onQuantityChange={handleQuantityChange}
										isUpdating={isUpdating}
										outgoingPlanName={outgoing?.[0]?.plan.name}
									/>
								))
							) : null}
						</motion.div>

						{/* Right column - Order summary */}
						<motion.div
							className="flex flex-col gap-6 w-full lg:w-1/2"
							variants={fadeUpVariants}
							transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
						>
							{/* Order summary */}
							<motion.div
								animate={{ opacity: isUpdating ? 0.6 : 1 }}
								transition={FAST_TRANSITION}
							>
								{isLoading ? (
									<OrderSummarySkeleton />
								) : preview ? (
									<OrderSummary planName={primaryPlanName} preview={preview} />
								) : null}
							</motion.div>

						{/* Spacer */}
						<div className="flex-1" />

						{/* Bottom section */}
						<motion.div
							className="flex flex-col gap-6"
							variants={fadeUpVariants}
							transition={{ ...STANDARD_TRANSITION, delay: 0.15 }}
						>
							<Separator />

							{/* Amount due today */}
							<div className="flex items-center justify-between">
								{isLoading ? (
									<>
										<Skeleton className="h-5 w-32" />
										<Skeleton className="h-6 w-16" />
									</>
								) : (
									<>
										<span className="text-base font-medium text-foreground">
											Amount due today
										</span>
										<span className="text-lg font-medium text-foreground tabular-nums">
											{formatAmount(total, currency)}
										</span>
									</>
								)}
							</div>

							{/* Confirm button */}
							{isLoading ? (
								<Skeleton className="h-12 w-full rounded-lg" />
							) : (
								<motion.div
									whileTap={{ scale: 0.98 }}
									transition={FAST_TRANSITION}
								>
									<Button
										className="w-full h-12 text-base font-medium rounded-lg"
										onClick={handleConfirm}
										disabled={confirmMutation.isPending || isUpdating}
									>
										{confirmMutation.isPending
											? "Processing..."
											: isUpdating
												? "Updating..."
												: isSubscription
													? "Pay and subscribe"
													: "Pay"}
									</Button>
								</motion.div>
							)}

							{/* Error message */}
							<AnimatePresence>
								{confirmMutation.error && (
									<motion.p
										className="text-sm text-destructive text-center"
										initial={{ opacity: 0, y: -5 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -5 }}
										transition={FAST_TRANSITION}
									>
										{confirmMutation.error instanceof Error
											? confirmMutation.error.message
											: "Failed to confirm checkout"}
									</motion.p>
								)}
							</AnimatePresence>
						</motion.div>
						</motion.div>
					</div>
				</LayoutGroup>

				<motion.div
					variants={fadeUpVariants}
					transition={{ ...STANDARD_TRANSITION, delay: 0.2 }}
				>
					<CheckoutFooter disabled={isLoading} />
				</motion.div>
			</motion.div>
		</CheckoutBackground>
	);
}
