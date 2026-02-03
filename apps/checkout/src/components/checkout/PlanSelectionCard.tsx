import type { ApiPlanFeature, CheckoutChange } from "@autumn/shared";
import { Check, Package } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	FAST_TRANSITION,
	LAYOUT_TRANSITION,
	STANDARD_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";
import { QuantityInput } from "./QuantityInput";
import { CardBackground } from "@/components/checkout/CardBackground";

function categorizeFeatures(features: ApiPlanFeature[]): {
	prepaid: ApiPlanFeature[];
	payPerUse: ApiPlanFeature[];
	included: ApiPlanFeature[];
} {
	const prepaid: ApiPlanFeature[] = [];
	const payPerUse: ApiPlanFeature[] = [];
	const included: ApiPlanFeature[] = [];

	for (const feature of features) {
		if (!feature.price) {
			included.push(feature);
			continue;
		}

		if (feature.price.usage_model === "prepaid") {
			prepaid.push(feature);
		} else {
			payPerUse.push(feature);
		}
	}

	return { prepaid, payPerUse, included };
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
}

export function PlanSelectionCard({
	change,
	currency,
	quantities,
	onQuantityChange,
}: PlanSelectionCardProps) {
	const { plan, feature_quantities } = change;
	const { prepaid, payPerUse, included } = categorizeFeatures(plan.features);
	const basePrice = plan.price;
	const hasPricedFeatures = prepaid.length > 0 || payPerUse.length > 0;
	const hasIncludedFeatures = included.length > 0;

	// Show included features only when there are no priced features
	const showIncludedFeatures = !hasPricedFeatures && hasIncludedFeatures;

	return (
		<motion.div
			layout
			layoutId={`plan-selection-${plan.id}`}
			transition={{ layout: LAYOUT_TRANSITION }}
		>
			<Card className="py-0 gap-0">
				<CardBackground>
				{/* Plan header */}
				<motion.div
					className="flex items-center px-3 py-2 border-b bg-background/50"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={STANDARD_TRANSITION}
				>
					<div className="flex items-center gap-2 min-w-0">
						<Package className="h-4 w-4 text-muted-foreground shrink-0" weight="bold" />
						<span className="text-sm font-medium text-foreground truncate">{plan.name}</span>
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
							{prepaid.map((feature, index) => {
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
										transition={{ layout: LAYOUT_TRANSITION }}
									>
										{index > 0 && (
											<div className="px-3">
												<Separator />
											</div>
										)}
										<div className="flex items-center justify-between gap-4 px-3 py-2.5">
											<div className="flex flex-col gap-0.5 min-w-0">
												<span className="text-sm text-foreground truncate">
													{getFeatureName(feature)}
												</span>
												<span className="text-xs text-muted-foreground truncate">
													{formatAmount(unitPrice, currency)} per{" "}
													{billingUnits === 1
														? getFeatureUnitDisplay(feature, false)
														: `${billingUnits} ${getFeatureUnitDisplay(feature, true)}`}
												</span>
											</div>
											<div className="flex items-center gap-4 shrink-0">
												<motion.span
													key={totalPrice}
													className="text-sm text-muted-foreground tabular-nums"
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

								// Show separator if there are prepaid features before, or if not the first pay-per-use
								const showSeparator = index > 0 || prepaid.length > 0;

								return (
									<motion.div
										key={feature.feature_id}
										variants={listItemVariants}
										layout
										transition={{ layout: LAYOUT_TRANSITION }}
									>
										{showSeparator && (
											<div className="px-3">
												<Separator />
											</div>
										)}
										<div className="flex items-center justify-between gap-4 px-3 py-2.5">
											<div className="flex items-center gap-2 min-w-0">
												<motion.div
													className="shrink-0"
													initial={{ scale: 0, opacity: 0 }}
													animate={{ scale: 1, opacity: 1 }}
													transition={{
														type: "spring",
														stiffness: 400,
														damping: 20,
														delay: 0.1 + index * 0.05,
													}}
												>
													<Check className="h-4 w-4 text-muted-foreground" />
												</motion.div>
												<span className="text-sm text-muted-foreground truncate">
													{getFeatureName(feature)}
												</span>
											</div>
											<span className="text-sm text-muted-foreground shrink-0">
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

				{/* Included features - shown only when there are no priced features */}
				{showIncludedFeatures && (
					<motion.div
						className="flex flex-col"
						variants={listContainerVariants}
						initial="initial"
						animate="animate"
					>
						{included.map((feature, index) => (
							<motion.div
								key={feature.feature_id}
								variants={listItemVariants}
								layout
								transition={{ layout: LAYOUT_TRANSITION }}
							>
								{index > 0 && (
									<div className="px-3">
										<Separator />
									</div>
								)}
								<div className="flex items-center justify-between gap-4 px-3 py-2.5">
									<div className="flex items-center gap-2 min-w-0">
										<motion.div
											className="shrink-0"
											initial={{ scale: 0, opacity: 0 }}
											animate={{ scale: 1, opacity: 1 }}
											transition={{
												type: "spring",
												stiffness: 400,
												damping: 20,
												delay: 0.1 + index * 0.05,
											}}
										>
											<Check className="h-4 w-4 text-muted-foreground" />
										</motion.div>
										<span className="text-sm text-muted-foreground truncate">
											{getFeatureName(feature)}
										</span>
									</div>
									{feature.included_usage !== undefined && feature.included_usage !== null && (
										<span className="text-sm text-muted-foreground shrink-0">
											{feature.included_usage === -1
												? "Unlimited"
												: `${feature.included_usage} included`}
										</span>
									)}
								</div>
							</motion.div>
						))}
					</motion.div>
				)}
				</CardBackground>
			</Card>
		</motion.div>
	);
}
