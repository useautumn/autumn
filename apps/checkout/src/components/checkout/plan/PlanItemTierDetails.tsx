import type { ApiPlanItemV1 } from "@autumn/shared";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/utils/formatUtils";

type PlanItemTier = NonNullable<NonNullable<ApiPlanItemV1["price"]>["tiers"]>[number];

function getBillingUnitsLabel({ billingUnits }: { billingUnits: number }) {
	return billingUnits === 1 ? "unit" : `${billingUnits} units`;
}

function getSelectedQuantityLabel({ quantity }: { quantity: number }) {
	return quantity === 1 ? "1 unit" : `${quantity} units`;
}

function normalizeGraduatedTiers({
	planItem,
	tiers,
}: {
	planItem: ApiPlanItemV1;
	tiers: PlanItemTier[];
}) {
	const included = planItem.included ?? 0;
	const isVolume = planItem.price?.tier_behavior === "volume";

	if (included <= 0 || isVolume) {
		return tiers;
	}

	return [{ to: included, amount: 0 }, ...tiers];
}

function isInfiniteTier({ to }: { to: number | "inf" }) {
	return to === "inf" || to === -1;
}

function getVolumeTierText({
	tiers,
	selectedQuantity,
	billingUnits,
	currency,
}: {
	tiers: PlanItemTier[];
	selectedQuantity: number;
	billingUnits: number;
	currency: string;
}) {
	const matchedTier =
		tiers.find((tier) =>
			isInfiniteTier({ to: tier.to })
				? true
				: selectedQuantity <= (tier.to as number),
		) ?? tiers[tiers.length - 1];

	if (!matchedTier) return "";

	const flatAmount = matchedTier.flat_amount ?? 0;
	const unitAmount = matchedTier.amount ?? 0;

	if (unitAmount > 0 && flatAmount > 0) {
		return `${formatAmount(unitAmount, currency)} per ${getBillingUnitsLabel({
			billingUnits,
		})} + ${formatAmount(flatAmount, currency)} flat fee`;
	}

	if (flatAmount > 0) {
		return `${formatAmount(flatAmount, currency)} for ${getSelectedQuantityLabel({
			quantity: selectedQuantity,
		})}`;
	}

	if (unitAmount > 0) {
		return `${formatAmount(unitAmount, currency)} per ${getBillingUnitsLabel({
			billingUnits,
		})}`;
	}

	return `${formatAmount(0, currency)} for ${getSelectedQuantityLabel({
		quantity: selectedQuantity,
	})}`;
}

function getTierRateText({
	tier,
	billingUnits,
	currency,
}: {
	tier: PlanItemTier;
	billingUnits: number;
	currency: string;
}) {
	const rateText = `${formatAmount(tier.amount ?? 0, currency)} per ${getBillingUnitsLabel({ billingUnits })}`;
	const flatAmount = tier.flat_amount ?? 0;

	if (flatAmount > 0) {
		return `${rateText} + ${formatAmount(flatAmount, currency)} flat`;
	}

	return rateText;
}

function getTierRangeText({
	index,
	tiers,
	isVolume,
}: {
	index: number;
	tiers: PlanItemTier[];
	isVolume: boolean;
}) {
	const tier = tiers[index];
	if (!tier) return "";

	if (isVolume) {
		if (index === 0) {
			return isInfiniteTier({ to: tier.to }) ? "thereafter" : `for the first ${tier.to}`;
		}

		if (isInfiniteTier({ to: tier.to })) {
			return "thereafter";
		}

		const previousTier = tiers[index - 1];
		if (
			!previousTier ||
			typeof previousTier.to !== "number" ||
			typeof tier.to !== "number"
		) {
			return "";
		}

		return `for the next ${tier.to - previousTier.to}`;
	}

	if (index === 0) {
		return isInfiniteTier({ to: tier.to })
			? "afterwards"
			: `for the first ${tier.to}`;
	}

	if (isInfiniteTier({ to: tier.to })) {
		return "afterwards";
	}

	const previousTier = tiers[index - 1];
	if (!previousTier || typeof previousTier.to !== "number") return "";

	return `for ${previousTier.to} - ${tier.to}`;
}

function getTierLineText({
	index,
	tiers,
	billingUnits,
	currency,
	isVolume,
}: {
	index: number;
	tiers: PlanItemTier[];
	billingUnits: number;
	currency: string;
	isVolume: boolean;
}) {
	const tier = tiers[index];
	if (!tier) return "";

	return `${getTierRateText({ tier, billingUnits, currency })} ${getTierRangeText({
		index,
		tiers,
		isVolume,
	})}`.trim();
}

function getSingleRateText({
	planItem,
	currency,
}: {
	planItem: ApiPlanItemV1;
	currency: string;
}) {
	const price = planItem.price;
	if (!price) return "";

	const rateText = `${formatAmount(price.amount || 0, currency)} per ${getBillingUnitsLabel({
		billingUnits: price.billing_units || 1,
	})}`;
	const included = planItem.included ?? 0;

	return included > 0 ? `${included} included then ${rateText}` : rateText;
}

export function PlanItemTierDetails({
	planItem,
	currency,
	align = "left",
	selectedQuantity,
}: {
	planItem: ApiPlanItemV1;
	currency: string;
	align?: "left" | "right";
	selectedQuantity?: number;
}) {
	const price = planItem.price;
	if (!price) return null;

	const tiers = price.tiers;
	if (!tiers || tiers.length <= 1) {
		return (
			<span className="text-xs text-muted-foreground/60 truncate">
				{getSingleRateText({ planItem, currency })}
			</span>
		);
	}

	const billingUnits = price.billing_units || 1;
	const displayTiers = normalizeGraduatedTiers({ planItem, tiers });
	const isVolume = price.tier_behavior === "volume";
	const currentQuantity = selectedQuantity ?? 0;

	if (isVolume) {
		return (
			<span className="text-xs text-muted-foreground/60 truncate">
				{getVolumeTierText({
					tiers,
					selectedQuantity: currentQuantity,
					billingUnits,
					currency,
				})}
			</span>
		);
	}

	return (
		<Accordion
			className={cn(
				"w-auto max-w-full",
				align === "right" && "items-end text-right",
			)}
		>
			<AccordionItem value={planItem.feature_id} className="border-none">
				<AccordionTrigger
					className={cn(
						"inline-flex w-auto max-w-full flex-none items-center gap-0.5 rounded-none py-0 text-xs leading-4 font-normal text-muted-foreground/60 hover:text-muted-foreground/50 hover:no-underline focus-visible:border-transparent focus-visible:ring-0 [&>[data-slot=accordion-trigger-icon]]:hidden",
						align === "left" ? "justify-start text-left" : "justify-end self-end text-right",
					)}
				>
					<span className="inline-flex items-center gap-0.5 truncate leading-4">
						<span className="truncate leading-4">
							{getTierLineText({
								index: 0,
								tiers: displayTiers,
								billingUnits,
								currency,
								isVolume,
							})}
						</span>
						<CaretRightIcon className="size-3 shrink-0 self-center text-current group-aria-expanded/accordion-trigger:hidden" />
						<CaretDownIcon className="hidden size-3 shrink-0 self-center text-current group-aria-expanded/accordion-trigger:inline" />
					</span>
				</AccordionTrigger>
				<AccordionContent
					className={cn(
						"pt-0.5 pb-0",
						align === "right" && "flex flex-col items-end text-right",
					)}
				>
					<div
						className={cn(
							"flex flex-col gap-0.5",
							align === "right" && "items-end text-right",
						)}
					>
						{displayTiers.slice(1).map((_, index) => (
							<span
								key={`${planItem.feature_id}-${index + 1}`}
								className="text-xs text-muted-foreground/60"
							>
								{getTierLineText({
									index: index + 1,
									tiers: displayTiers,
									billingUnits,
									currency,
									isVolume,
								})}
							</span>
						))}
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
