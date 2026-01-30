import type { ApiPlanFeature, CheckoutChange } from "@autumn/shared";
import { Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedCard } from "@/components/motion/animated-layout";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	FAST_TRANSITION,
	STANDARD_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";
import { QuantityInput } from "./QuantityInput";

function getPricedFeatures(features: ApiPlanFeature[]): {
	prepaid: ApiPlanFeature[];
	payPerUse: ApiPlanFeature[];
} {
	const prepaid: ApiPlanFeature[] = [];
	const payPerUse: ApiPlanFeature[] = [];

	for (const feature of features) {
		if (!feature.price) continue;

		if (feature.price.usage_model === "prepaid") {
			prepaid.push(feature);
		} else {
			payPerUse.push(feature);
		}
	}

	return { prepaid, payPerUse };
}

function formatInterval(interval: string): string {
	switch (interval) {
		case "month":
			return "mo";
		case "year":
			return "yr";
		case "week":
			return "wk";
		case "day":
			return "day";
		default:
			return interval;
	}
}

function getFeatureName(feature: ApiPlanFeature): string {
	return feature.feature?.name || feature.feature_id;
}

function getFeatureUnitDisplay(
	feature: ApiPlanFeature,
	plural: boolean,
): string {
	const display = feature.feature?.display;
	if (display) {
		return plural ? display.plural : display.singular;
	}
	return plural ? "units" : "unit";
}

interface PlanSelectionCardProps {
	change: CheckoutChange;
	currency: string;
	quantities: Record<string, number>;
	onQuantityChange: (
		featureId: string,
		quantity: number,
		billingUnits: number,
	) => void;
	isUpdating?: boolean;
	outgoingPlanName?: string;
}

export function PlanSelectionCard({
	change,
	currency,
	quantities,
	onQuantityChange,
	isUpdating = false,
	outgoingPlanName,
}: PlanSelectionCardProps) {
	const { plan, feature_quantities } = change;
	const { prepaid, payPerUse } = getPricedFeatures(plan.features);
	const basePrice = plan.price;
	const hasPricedFeatures = prepaid.length > 0 || payPerUse.length > 0;

	return (
		<AnimatedCard layoutId="plan-selection-card">
			<Card className="py-0 gap-0">
				{/* Plan change label */}
				{outgoingPlanName && (
					<motion.div
						className="px-4 pt-3 pb-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={STANDARD_TRANSITION}
					>
						<span className="text-xs text-muted-foreground">
							{plan.customer_eligibility?.scenario === "upgrade"
								? "Upgrading"
								: plan.customer_eligibility?.scenario === "downgrade"
									? "Downgrading"
									: "Changing"}{" "}
							from {outgoingPlanName}
						</span>
					</motion.div>
				)}

				{/* Plan header */}
				<motion.div
					className={`flex items-center justify-between px-4 ${outgoingPlanName ? "pt-1 pb-4" : "py-4"}`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={STANDARD_TRANSITION}
				>
					<div className="flex justify-between items-center w-full gap-0.5">
						<span className="text-base text-foreground">{plan.name}</span>
						{basePrice && (
							<motion.div
								className="flex items-center gap-1 text-muted-foreground"
								initial={{ opacity: 0, x: 10 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
							>
								{formatAmount(basePrice.amount, currency)} per{" "}
								{basePrice.interval}
							</motion.div>
						)}
					</div>
				</motion.div>

				{hasPricedFeatures && (
					<motion.div
						className="flex flex-col"
						variants={listContainerVariants}
						initial="initial"
						animate="animate"
					>
						{/* Prepaid features - show quantity selector */}
						<AnimatePresence>
							{prepaid.map((feature) => {
								const price = feature.price;
								if (!price) return null;

								const quantityInfo = feature_quantities.find(
									(fq) => fq.feature_id === feature.feature_id,
								);
								const currentQuantity =
									quantities[feature.feature_id] ?? quantityInfo?.quantity ?? 0;

								const billingUnits = price.billing_units || 1;
								const unitPrice = price.amount || 0;
								const units = currentQuantity / billingUnits;
								const totalPrice = units * unitPrice;
								const intervalLabel = formatInterval(price.interval || "month");

								return (
									<motion.div
										key={feature.feature_id}
										variants={listItemVariants}
										layout
										transition={STANDARD_TRANSITION}
									>
										<div className="px-4">
											<Separator className="w-auto" />
										</div>
										<div className="flex items-center justify-between px-4 py-4">
											<div className="flex flex-col gap-0.5">
												<span className="text-foreground">
													{getFeatureName(feature)}
												</span>
												<span className="text-sm text-muted-foreground">
													{formatAmount(unitPrice, currency)} per{" "}
													{billingUnits === 1
														? getFeatureUnitDisplay(feature, false)
														: `${billingUnits} ${getFeatureUnitDisplay(feature, true)}`}
												</span>
											</div>
											<div className="flex items-center gap-4">
												<motion.span
													key={totalPrice}
													className="text-[15px] text-muted-foreground leading-none tracking-tight tabular-nums"
													initial={{ opacity: 0.5 }}
													animate={{ opacity: 1 }}
													transition={FAST_TRANSITION}
												>
													{formatAmount(totalPrice, currency)}/{intervalLabel}
												</motion.span>
												<QuantityInput
													value={currentQuantity}
													onChange={(value) =>
														onQuantityChange(
															feature.feature_id,
															value,
															billingUnits,
														)
													}
													min={0}
													max={
														price.max_purchase
															? price.max_purchase * billingUnits
															: undefined
													}
													step={billingUnits}
													disabled={isUpdating}
												/>
											</div>
										</div>
									</motion.div>
								);
							})}
						</AnimatePresence>

						{/* Pay-per-use features - show rate with checkmark */}
						<AnimatePresence>
							{payPerUse.map((feature, index) => {
								const price = feature.price;
								if (!price) return null;

								const billingUnits = price.billing_units || 1;

								// Handle tiered pricing
								let priceDisplay: string;
								if (price.tiers && price.tiers.length > 0) {
									const firstTier = price.tiers[0];
									const tierPrice =
										firstTier?.unit_price ?? firstTier?.flat_price ?? 0;
									priceDisplay = `From ${formatAmount(tierPrice, currency)}`;
								} else {
									priceDisplay = formatAmount(price.amount || 0, currency);
								}

								return (
									<motion.div
										key={feature.feature_id}
										variants={listItemVariants}
										layout
										transition={STANDARD_TRANSITION}
									>
										<div className="px-4">
											<Separator className="w-auto" />
										</div>
										<div className="flex items-center justify-between px-4 py-3">
											<div className="flex items-center gap-3">
												<motion.div
													initial={{ scale: 0, opacity: 0 }}
													animate={{ scale: 1, opacity: 1 }}
													transition={{
														type: "spring",
														stiffness: 400,
														damping: 20,
														delay: 0.1 + index * 0.05,
													}}
												>
													<Check className="h-4 w-4 text-muted-foreground shrink-0" />
												</motion.div>
												<span className="text-sm text-foreground">
													{getFeatureName(feature)}
												</span>
											</div>
											<span className="text-sm text-muted-foreground">
												{priceDisplay} per{" "}
												{billingUnits === 1
													? getFeatureUnitDisplay(feature, false)
													: `${billingUnits} ${getFeatureUnitDisplay(feature, true)}`}
											</span>
										</div>
									</motion.div>
								);
							})}
						</AnimatePresence>
					</motion.div>
				)}
			</Card>
		</AnimatedCard>
	);
}
