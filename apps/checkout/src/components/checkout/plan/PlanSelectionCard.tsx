import {
	type ApiPlanItemV1,
	type BillingPreviewChange,
} from "@autumn/shared";
import { CheckIcon, WalletIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import {
	LAYOUT_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { PlanItemTierDetails } from "./PlanItemTierDetails";
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

function getFeatureName(planItem: ApiPlanItemV1): string {
	return planItem.feature?.name || planItem.feature_id;
}

interface PlanSelectionCardProps {
	change: BillingPreviewChange;
}

export function PlanSelectionCard({ change }: PlanSelectionCardProps) {
	const { currency, quantities, handleQuantityChange } = useCheckoutContext();
	const { plan, feature_quantities } = change;
	if (!plan) return null;

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
						{prepaid.map((planItem, index) => {
							const price = planItem.price;
							if (!price) return null;
							const isTiered = (price.tiers?.length ?? 0) > 1;

							const quantityInfo = feature_quantities.find(
								(fq) => fq.feature_id === planItem.feature_id,
							);
							const currentQuantity =
								quantities[planItem.feature_id] ?? quantityInfo?.quantity ?? 0;
							const billingUnits = price.billing_units || 1;

							return (
								<motion.div
									key={planItem.feature_id}
									variants={listItemVariants}
									layout={!isTiered}
									transition={isTiered ? undefined : { layout: LAYOUT_TRANSITION }}
								>
									<div className="flex items-start justify-between gap-4 py-0.5">
										<div className="flex gap-2">
											<motion.div
												className="shrink-0 pt-1"
												initial={{ scale: 0, opacity: 0 }}
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
													{getFeatureName(planItem)}
												</span>
												<PlanItemTierDetails
													planItem={planItem}
													currency={currency}
													selectedQuantity={currentQuantity}
												/>
											</div>
										</div>
										<div className="flex items-start gap-3 shrink-0 pt-0.5">
											<QuantityInput
												value={currentQuantity}
												onChange={(value) =>
													handleQuantityChange(
														planItem.feature_id,
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
							const isTiered = (price.tiers?.length ?? 0) > 1;

							return (
								<motion.div
									key={feature.feature_id}
									variants={listItemVariants}
									layout={!isTiered}
									transition={isTiered ? undefined : { layout: LAYOUT_TRANSITION }}
								>
									<div
										className={`flex justify-between gap-4 py-0.5 ${isTiered ? "items-start" : "items-center"}`}
									>
										<div
											className={`flex gap-2 min-w-0 ${isTiered ? "" : "items-center"}`}
										>
											<motion.div
												className={`shrink-0 ${isTiered ? "pt-0.5" : ""}`}
												initial={{ scale: 0, opacity: 0 }}
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
											{isTiered ? (
												<div className="flex flex-col gap-0.5 min-w-0">
													<span className="text-sm text-muted-foreground truncate">
														{getFeatureName(feature)}
													</span>
													<PlanItemTierDetails
														planItem={feature}
														currency={currency}
													/>
												</div>
											) : (
												<span className="text-sm text-muted-foreground truncate">
													{getFeatureName(feature)}
												</span>
											)}
										</div>
										{!isTiered && (
											<div className="shrink-0">
												<PlanItemTierDetails
													planItem={feature}
													currency={currency}
													align="right"
												/>
											</div>
										)}
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
										initial={{ scale: 0, opacity: 0 }}
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
