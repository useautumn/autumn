import { format } from "date-fns";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useParams } from "react-router-dom";
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
import { CheckoutProvider, useCheckoutContext } from "@/contexts/CheckoutContext";
import {
	FAST_TRANSITION,
	STANDARD_TRANSITION,
	fadeUpVariants,
	listContainerVariants,
} from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";

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

function PlanSection() {
	const { incoming, status } = useCheckoutContext();

	return (
		<motion.div
			className="flex flex-col gap-4 w-full lg:flex-1 min-w-0"
			variants={fadeUpVariants}
			transition={{ ...STANDARD_TRANSITION, delay: 0.05 }}
		>
			<SectionHeader title="Plan Details" />

			<CrossfadeContainer
				isLoading={status.isLoading}
				skeleton={<PlanSelectionCardSkeleton />}
			>
				{incoming?.map((change) => (
					<PlanSelectionCard key={change.plan.id} change={change} />
				))}
			</CrossfadeContainer>
		</motion.div>
	);
}

function OrderSummarySection() {
	const { status } = useCheckoutContext();

	return (
		<motion.div
			className="flex flex-col gap-4 w-full lg:flex-1 min-w-0"
			variants={fadeUpVariants}
			transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
		>
			<SectionHeader title="Order Summary" />

			<motion.div
				animate={{ opacity: status.isUpdating ? 0.6 : 1 }}
				transition={FAST_TRANSITION}
			>
				<CrossfadeContainer
					isLoading={status.isLoading}
					skeleton={<OrderSummarySkeleton />}
				>
					<OrderSummary />
				</CrossfadeContainer>
			</motion.div>
		</motion.div>
	);
}

function ConfirmSection() {
	const {
		status,
		total,
		currency,
		preview,
		isSubscription,
		hasActiveTrial,
		handleConfirm,
	} = useCheckoutContext();

	return (
		<div className="flex flex-col gap-4">
			<motion.div
				variants={fadeUpVariants}
				transition={{ ...STANDARD_TRANSITION, delay: 0.15 }}
			>
				<CrossfadeContainer
					isLoading={status.isLoading}
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
									{preview.next_cycle.starts_at
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
							disabled={status.isConfirming || status.isUpdating}
						>
							{getButtonText({
								isPending: status.isConfirming,
								isUpdating: status.isUpdating,
								total,
								nextCycleTotal: preview?.next_cycle?.total ?? 0,
								isSubscription,
								hasActiveTrial,
							})}
						</Button>
					</motion.div>

					{/* Error message */}
					<AnimatePresence>
						{status.confirmError && (
							<motion.p
								className="text-sm text-destructive text-center"
								initial={{ opacity: 0, y: -5 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -5 }}
								transition={FAST_TRANSITION}
							>
								{status.confirmError instanceof Error
									? status.confirmError.message
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
				<CheckoutFooter />
			</motion.div>
		</div>
	);
}

function CheckoutContent() {
	const { confirmResult, status, isSandbox } = useCheckoutContext();

	// Handle success state
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

	// Handle error state
	if (status.error) {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<CheckoutErrorState
					message={
						status.error instanceof Error
							? status.error.message
							: "Failed to load checkout"
					}
				/>
			</motion.div>
		);
	}

	// Main checkout view
	return (
		<CheckoutBackground isSandbox={isSandbox}>
			<motion.div
				className="flex flex-col gap-8 w-full"
				initial="initial"
				animate="animate"
				variants={listContainerVariants}
			>
				{/* Header */}
				<motion.div variants={fadeUpVariants} transition={STANDARD_TRANSITION}>
					<CheckoutHeader />
				</motion.div>

				{/* Main content - two columns */}
				<LayoutGroup>
					<div className="flex flex-col lg:flex-row gap-8 w-full max-w-4xl mx-auto">
						<PlanSection />

						{/* Vertical separator - visible only on desktop */}
						<Separator
							orientation="vertical"
							className="hidden lg:block h-auto self-stretch"
						/>
						<Separator
							orientation="horizontal"
							className="block lg:hidden h-auto self-stretch"
						/>

						<OrderSummarySection />
					</div>
				</LayoutGroup>

				<Separator />

				<ConfirmSection />
			</motion.div>
		</CheckoutBackground>
	);
}

export function CheckoutPage() {
	const { checkoutId: checkoutIdParam } = useParams<{ checkoutId: string }>();
	const checkoutId = checkoutIdParam ?? "";

	if (!checkoutId) {
		return <CheckoutErrorState message="Missing checkout ID" />;
	}

	return (
		<CheckoutProvider checkoutId={checkoutId}>
			<CheckoutContent />
		</CheckoutProvider>
	);
}
