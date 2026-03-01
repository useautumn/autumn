import type { ApiPlanItemV1, CheckoutChange } from "@autumn/shared";
import { CheckIcon, Wallet, WalletIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import {
	FAST_TRANSITION,
	LAYOUT_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";
import { QuantityInput } from "../shared/QuantityInput";

function categorizeFeatures(features: ApiPlanItemV1[]): {
	prepaid: ApiPlanItemV1[];
	payPerUse: ApiPlanItemV1[];
	included: ApiPlanItemV1[];
} {
	const prepaid: ApiPlanItemV1[] = [];
	const payPerUse: ApiPlanItemV1[] = [];
	const included: ApiPlanItemV1[] = [];

	for (const feature of features) {
		if (!feature.price) {
			included.push(feature);
			continue;
		}

		if (feature.price.billing_method === "prepaid") {
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

function getFeatureName(feature: ApiPlanItemV1): string {
	return feature.feature?.name || feature.feature_id;
}

function getFeatureUnitDisplay(
	feature: ApiPlanItemV1,
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
}

export function PlanSelectionCard({ change }: PlanSelectionCardProps) {
	const { currency, quantities, handleQuantityChange } = useCheckoutContext();
	const { plan, feature_quantities } = change;
	const { prepaid, payPerUse, included } = categorizeFeatures(plan.items);
	const hasPricedFeatures = prepaid.length > 0 || payPerUse.length > 0;
	const hasIncludedFeatures = included.length > 0;

	// Show included features only when there are no priced features
	const showIncludedFeatures = !hasPricedFeatures && hasIncludedFeatures;

	return (
		<motion.div
			layout
			layoutId={`plan-selection-${plan.id}`}
			transition={{ layout: LAYOUT_TRANSITION }}
			className="flex flex-col gap-1"
		>
			{/* Plan name as section label */}
			<span className="text-sm text-foreground">{plan.name}</span>

			{hasPricedFeatures && (
				<motion.div
					className="flex flex-col gap-1"
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
									<div className="flex items-center justify-between gap-4 py-0.5">
										<div className="flex gap-2">
											<motion.div
												className="shrink-0 pt-1"
												initial={{ scale: 0.95, opacity: 0 }}
												animate={{ scale: 1, opacity: 1 }}
												transition={{
													type: "spring",
													stiffness: 400,
													damping: 20,
													delay: 0.1 + index * 0.05,
												}}
											>
												<WalletIcon className="h-3.5 w-3.5 text-muted-foreground" />
											</motion.div>
											<div className="flex flex-col gap-0.5 min-w-0">
												<span className="text-sm text-muted-foreground truncate">
													{getFeatureName(feature)}
												</span>
												<span className="text-xs text-muted-foreground/60 truncate">
													{formatAmount(unitPrice, currency)} per{" "}
													{billingUnits === 1
														? getFeatureUnitDisplay(feature, false)
														: `${billingUnits} ${getFeatureUnitDisplay(feature, true)}`}
												</span>
											</div>
										</div>
										<div className="flex items-center gap-3 shrink-0">
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
													handleQuantityChange(
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

							return (
								<motion.div
									key={feature.feature_id}
									variants={listItemVariants}
									layout
									transition={{ layout: LAYOUT_TRANSITION }}
								>
									<div className="flex items-center justify-between gap-4 py-0.5">
										<div className="flex items-center gap-2 min-w-0">
											<motion.div
												className="shrink-0"
												initial={{ scale: 0.95, opacity: 0 }}
												animate={{ scale: 1, opacity: 1 }}
												transition={{
													type: "spring",
													stiffness: 400,
													damping: 20,
													delay: 0.1 + index * 0.05,
												}}
											>
												<CheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
							<div className="flex items-center justify-between gap-4 py-0.5">
								<div className="flex items-center gap-2 min-w-0">
									<motion.div
										className="shrink-0"
										initial={{ scale: 0.95, opacity: 0 }}
										animate={{ scale: 1, opacity: 1 }}
										transition={{
											type: "spring",
											stiffness: 400,
											damping: 20,
											delay: 0.1 + index * 0.05,
										}}
									>
										<CheckIcon className="h-3.5 w-3.5 text-muted-foreground" />
									</motion.div>
									<span className="text-sm text-muted-foreground truncate">
										{getFeatureName(feature)}
									</span>
								</div>
								{feature.included > 0 || feature.unlimited ? (
									<span className="text-sm text-muted-foreground shrink-0">
										{feature.unlimited
											? "Unlimited"
											: `${feature.included} included`}
									</span>
								) : null}
							</div>
						</motion.div>
					))}
				</motion.div>
			)}
		</motion.div>
	);
}
