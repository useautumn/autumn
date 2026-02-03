import type { CheckoutChange, ConfirmCheckoutResponse } from "@autumn/shared";
import { format } from "date-fns";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { CheckoutErrorState } from "@/components/checkout/CheckoutErrorState";
import { CheckoutFooter } from "@/components/checkout/CheckoutFooter";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { CheckoutSuccessState } from "@/components/checkout/CheckoutSuccessState";
import { BottomSectionSkeleton } from "@/components/checkout/BottomSectionSkeleton";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { OrderSummarySkeleton } from "@/components/checkout/OrderSummarySkeleton";
import { PlanSelectionCard } from "@/components/checkout/PlanSelectionCard";
import { PlanSelectionCardSkeleton } from "@/components/checkout/PlanSelectionCardSkeleton";
import { SectionHeader } from "@/components/checkout/SectionHeader";
import { CrossfadeContainer } from "@/components/motion/CrossfadeContainer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { buildHeaderDescription } from "@/utils/buildHeaderDescription";
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

function getButtonText({
	isPending,
	isUpdating,
	total,
	nextCycleTotal,
	isSubscription,
	hasActiveTrial,
}: {
	isPending: boolean;
	isUpdating: boolean;
	total: number;
	nextCycleTotal: number;
	isSubscription: boolean;
	hasActiveTrial: boolean;
}): string {
	if (isPending) return "Processing...";
	if (isUpdating) return "Updating...";
	if (hasActiveTrial) return "Confirm and start trial";
	if (total === 0) {
		return nextCycleTotal > 0 ? "Confirm and Subscribe" : "Confirm";
	}
	return isSubscription ? "Pay and Subscribe" : "Pay";
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
		600,
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

	const headerDescription = useMemo(() => {
		const incomingPlan = checkoutData?.incoming?.[0]?.plan;
		const freeTrial = incomingPlan?.free_trial;
		const trialAvailable =
			incomingPlan?.customer_eligibility?.trial_available ?? false;

		return buildHeaderDescription({
			preview: checkoutData?.preview,
			incoming: checkoutData?.incoming,
			outgoing: checkoutData?.outgoing,
			entity: checkoutData?.entity,
			freeTrial,
			trialAvailable,
		});
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

	// Extract free trial info from first incoming plan
	const incomingPlan = incoming?.[0]?.plan;
	const freeTrial = incomingPlan?.free_trial;
	const trialAvailable =
		incomingPlan?.customer_eligibility?.trial_available ?? false;
	const hasActiveTrial = freeTrial && trialAvailable;
	const trialEndDate = incoming?.[0]?.period_end;

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
					<CheckoutHeader
						org={org}
						isLoading={isLoading}
						description={headerDescription}
					/>
				</motion.div>


				{/* Main content - two columns */}
				<LayoutGroup>
					<div className="flex flex-col lg:flex-row gap-8 w-full max-w-4xl mx-auto">
						{/* Left column - Plan selection */}
						<motion.div
							className="flex flex-col gap-4 w-full lg:flex-1 min-w-0"
							variants={fadeUpVariants}
							transition={{ ...STANDARD_TRANSITION, delay: 0.05 }}
						>
							<SectionHeader title="Plan Details" />

							<CrossfadeContainer
								isLoading={isLoading}
								skeleton={<PlanSelectionCardSkeleton />}
							>
								{incoming?.map((change) => (
									<PlanSelectionCard
										key={change.plan.id}
										change={change}
										currency={currency}
										quantities={quantities}
										onQuantityChange={handleQuantityChange}
									/>
								))}
							</CrossfadeContainer>
						</motion.div>

						{/* Vertical separator - visible only on desktop */}
						<Separator orientation="vertical" className="hidden lg:block h-auto self-stretch" />
						<Separator orientation="horizontal" className="block lg:hidden h-auto self-stretch" />

						{/* Right column - Order summary */}
						<motion.div
							className="flex flex-col gap-4 w-full lg:flex-1 min-w-0"
							variants={fadeUpVariants}
							transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
						>
							<SectionHeader title="Order Summary" />

							{/* Order summary */}
							<motion.div
								animate={{ opacity: isUpdating ? 0.6 : 1 }}
								transition={FAST_TRANSITION}
							>
								<CrossfadeContainer
									isLoading={isLoading}
									skeleton={<OrderSummarySkeleton />}
								>
									{preview && (
										<OrderSummary
											planName={primaryPlanName}
											preview={preview}
											incoming={incoming}
											outgoing={outgoing}
											freeTrial={freeTrial}
											trialAvailable={trialAvailable}
										/>
									)}
								</CrossfadeContainer>
							</motion.div>


						</motion.div>
					</div>
				</LayoutGroup>

				<Separator />

				<div className="flex flex-col gap-4">

					<motion.div
						variants={fadeUpVariants}
						transition={{ ...STANDARD_TRANSITION, delay: 0.15 }}
					>
						<CrossfadeContainer
							isLoading={isLoading}
							skeleton={<BottomSectionSkeleton />}
							className="flex flex-col gap-6"
						>
							{/* Amount summary */}
							<div className="flex flex-col gap-1">
								{/* Amount due today */}
								<div className="flex items-center justify-between">
									<span className="text-base font-medium text-foreground">
										Amount due today
									</span>
									<span className="text-lg font-medium text-foreground tabular-nums">
										{formatAmount(total, currency)}
									</span>
								</div>

								{/* Amount next cycle / Amount due on trial end */}
								{preview?.next_cycle && (
									<div className="flex items-center justify-between text-sm text-muted-foreground">
										<span>
											{hasActiveTrial && preview.next_cycle.starts_at
												? `Amount due on ${format(preview.next_cycle.starts_at, "do MMMM yyyy")}`
												: "Total due next cycle"}
										</span>
										<span className="tabular-nums">
											{formatAmount(preview.next_cycle.total, currency)}
										</span>
									</div>
								)}
							</div>

							{/* Confirm button */}
							<motion.div
								whileTap={{ scale: 0.98 }}
								transition={FAST_TRANSITION}
								className="pt-4"
							>
								<Button
									className="w-full h-12 text-base font-medium rounded-lg"
									onClick={handleConfirm}
									disabled={confirmMutation.isPending || isUpdating}
								>
									{getButtonText({
										isPending: confirmMutation.isPending,
										isUpdating,
										total,
										nextCycleTotal: preview?.next_cycle?.total ?? 0,
										isSubscription,
										hasActiveTrial: hasActiveTrial ?? false,
									})}
								</Button>
							</motion.div>

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
						</CrossfadeContainer>
					</motion.div>

					<motion.div
						variants={fadeUpVariants}
						transition={{ ...STANDARD_TRANSITION, delay: 0.2 }}
					>
						<CheckoutFooter disabled={isLoading} />
					</motion.div>
				</div>
			</motion.div>
		</CheckoutBackground>
	);
}
