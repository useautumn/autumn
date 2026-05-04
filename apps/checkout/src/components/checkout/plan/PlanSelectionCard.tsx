import {
	type ApiPlanItemV1,
	type GetCheckoutResponse,
} from "@autumn/shared";
import { WalletIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import {
	LAYOUT_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { PlanItemTierDetails } from "./PlanItemTierDetails";
import { QuantityInput } from "../shared/QuantityInput";

function getFeatureName(planItem: ApiPlanItemV1): string {
	return planItem.feature?.name || planItem.feature_id;
}

interface PlanSelectionCardProps {
	change: GetCheckoutResponse["preview"]["incoming"][number];
}

export function PlanSelectionCard({ change }: PlanSelectionCardProps) {
	const { currency, quantities, handleQuantityChange } = useCheckoutContext();
	const { plan, feature_quantities } = change;
	if (!plan) return null;

	const prepaidItems = plan.items.filter(
		(item) => item.price?.billing_method === "prepaid",
	);

	if (prepaidItems.length === 0) return null;

	return (
		<motion.div
			layout
			layoutId={`plan-selection-${plan.id}`}
			transition={{ layout: LAYOUT_TRANSITION }}
			className="flex flex-col gap-1"
		>
			<span className="text-sm text-foreground">{plan.name}</span>

			<motion.div
				className="flex flex-col gap-1"
				variants={listContainerVariants}
				initial="initial"
				animate="animate"
			>
				<AnimatePresence>
					{prepaidItems.map((planItem, index) => {
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
			</motion.div>
		</motion.div>
	);
}
