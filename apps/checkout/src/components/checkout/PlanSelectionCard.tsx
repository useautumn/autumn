import type { CheckoutChange } from "@autumn/shared";
import { Check } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { formatAmount } from "@/utils/formatUtils";
import { QuantityInput } from "./QuantityInput";

interface PrepaidFeatureInfo {
	featureId: string;
	name: string;
	quantity: number;
	unitPrice: number;
	billingUnits: number;
	maxPurchase: number | null;
	interval: string;
}

function getPrepaidFeatures(change: CheckoutChange): PrepaidFeatureInfo[] {
	const { plan, feature_quantities } = change;
	const prepaidFeatures: PrepaidFeatureInfo[] = [];

	for (const feature of plan.features) {
		if (feature.price?.usage_model === "prepaid") {
			const quantityInfo = feature_quantities.find(
				(fq) => fq.feature_id === feature.feature_id,
			);

			prepaidFeatures.push({
				featureId: feature.feature_id,
				name: feature.feature?.name || feature.feature_id,
				quantity: quantityInfo?.quantity || 0,
				unitPrice: feature.price.amount || 0,
				billingUnits: feature.price.billing_units || 1,
				maxPurchase: feature.price.max_purchase,
				interval: feature.price.interval || "month",
			});
		}
	}

	return prepaidFeatures;
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
}

export function PlanSelectionCard({
	change,
	currency,
	quantities,
	onQuantityChange,
	isUpdating = false,
}: PlanSelectionCardProps) {
	const { plan } = change;
	const prepaidFeatures = getPrepaidFeatures(change);
	const basePrice = plan.price;

	return (
		<Card className="py-0 gap-0">
			{/* Plan header */}
			<div className="flex items-center justify-between px-4 py-4">
				<div className="flex flex-col gap-0.5">
					<span className="text-base font-medium text-muted-foreground">
						{plan.name}
					</span>
					{basePrice && (
						<span className="text-lg font-semibold text-foreground">
							{formatAmount(basePrice.amount, currency)} per{" "}
							{basePrice.interval}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary">
					<Check className="h-4 w-4" weight="bold" />
					<span className="text-sm font-medium">Selected</span>
				</div>
			</div>

			{/* Prepaid features */}
			{prepaidFeatures.length > 0 && (
				<div className="divide-y divide-border border-t border-border">
					{prepaidFeatures.map((feature) => {
						const currentQuantity =
							quantities[feature.featureId] ?? feature.quantity;
						// Price per billing unit, so total = (quantity / billingUnits) * unitPrice
						const units = currentQuantity / feature.billingUnits;
						const totalPrice = units * feature.unitPrice;
						const intervalLabel = formatInterval(feature.interval);

						return (
							<div
								key={feature.featureId}
								className="flex items-center justify-between px-4 py-4"
							>
								<div className="flex flex-col gap-0.5">
									<span className="font-medium text-foreground">
										{feature.name}
									</span>
									<span className="text-sm text-muted-foreground">
										{formatAmount(feature.unitPrice, currency)} per{" "}
										{feature.billingUnits === 1
											? "unit"
											: `${feature.billingUnits} units`}
									</span>
								</div>
								<div className="flex items-center gap-4">
									<span className="font-medium tabular-nums text-foreground">
										{formatAmount(totalPrice, currency)}/{intervalLabel}
									</span>
									<QuantityInput
										value={currentQuantity}
										onChange={(value) =>
											onQuantityChange(
												feature.featureId,
												value,
												feature.billingUnits,
											)
										}
										min={0}
										max={
											feature.maxPurchase
												? feature.maxPurchase * feature.billingUnits
												: 999999
										}
										step={feature.billingUnits}
										disabled={isUpdating}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</Card>
	);
}
