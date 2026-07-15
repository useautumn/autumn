import { type PriceTier, TierBehavior, UsageModel } from "@autumn/shared";
import { IconButton, Input } from "@autumn/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { stampBaseCurrency } from "../../utils/currencyUtils";
import {
	addTier,
	removeTier,
	tierToDisplay,
	updateTier,
	type VolumePricingMode,
} from "../../utils/tierUtils";
import { AdditionalCurrenciesEditor } from "../shared/AdditionalCurrenciesEditor";
import {
	amountDisplayValue,
	CurrencyAmountInput,
} from "../shared/CurrencyAmountInput";
import { TieredCurrenciesEditor } from "../shared/TieredCurrenciesEditor";
import { BillingUnits } from "./BillingUnits";

const TierToInput = ({ index }: { index: number }) => {
	const { item, setItem } = useProductItemContext();
	const tiers = item?.tiers || [];
	const includedUsage =
		typeof item?.included_usage === "number" ? item?.included_usage : 0;

	const isInfinite = index === tiers.length - 1;

	const handleInputBlur = (value: string) => {
		if (isInfinite) return;
		const valueWithIncludedUsage = parseFloat(value) - includedUsage;
		const newTiers = [...tiers];
		newTiers[index] = { ...newTiers[index], to: valueWithIncludedUsage };
		setItem({ ...item, tiers: newTiers });
	};

	const [tierVal, setTierVal] = useState<string>(
		tierToDisplay({ tier: tiers[index], includedUsage }),
	);

	return (
		<Input
			value={tierVal}
			onBlur={() => handleInputBlur(tierVal)}
			onChange={(e) => setTierVal(e.target.value)}
			className="w-full"
			placeholder={isInfinite ? "∞" : "100"}
			inputMode="decimal"
			disabled={isInfinite || (tiers.length === 2 && index === 1)} // Disable infinity or 2nd tier in 2-tier setup
		/>
	);
};

export function PriceTiers({
	volumePricingMode,
}: {
	volumePricingMode?: VolumePricingMode;
}) {
	const { item, setItem } = useProductItemContext();
	const { org } = useOrg();
	const currency = org?.default_currency?.toUpperCase() ?? "USD";

	// Auto-select prepaid when volume-based is active with multiple tiers
	useEffect(() => {
		if (
			item?.tier_behavior === TierBehavior.VolumeBased &&
			(item?.tiers?.length ?? 0) > 1 &&
			item?.usage_model !== UsageModel.Prepaid
		) {
			setItem({ ...item, usage_model: UsageModel.Prepaid });
		}
	}, [item?.tier_behavior, item?.tiers?.length]);

	if (!item) return null;

	const tiers = item.tiers || [];
	const includedUsage = item.included_usage || 0;

	// Only show pricing UI if billing type is "priced" (has tiers)
	if (!tiers || tiers.length === 0) {
		return null;
	}

	// Simple single tier UI - just amount input with billing units
	if (tiers.length === 1) {
		const firstTier = tiers[0];

		return (
			<div className="space-y-2">
				<div className="flex gap-2 w-full items-center">
					<CurrencyAmountInput
						currencyCode={currency}
						displayValue={amountDisplayValue(firstTier.amount)}
						onRawChange={(raw) =>
							updateTier({
								item,
								setItem,
								index: 0,
								field: "amount",
								value: raw,
							})
						}
					/>

					<BillingUnits />

					<div className="flex items-center ml-auto gap-1">
						<IconButton
							variant="muted"
							className="text-tertiary-foreground text-xs"
							onClick={() => addTier({ item, setItem })}
							icon={<PlusIcon size={10} />}
							iconOrientation="left"
						>
							Add Tier
						</IconButton>
					</div>
				</div>

				{org?.config?.multi_currency && (
					<AdditionalCurrenciesEditor
						currencies={firstTier.additional_currencies?.map((entry) => ({
							currency: entry.currency,
							amount: entry.amount ?? 0,
						}))}
						onChange={(currencies) =>
							setItem(
								stampBaseCurrency({
									item: {
										...item,
										tiers: [
											{ ...firstTier, additional_currencies: currencies },
										],
									},
									orgCurrency: currency,
								}),
							)
						}
						baseCurrency={currency}
					/>
				)}
			</div>
		);
	}

	// Multi-tier UI - full tier management
	const isFlatMode = volumePricingMode === "flat";
	const amountField = isFlatMode ? "flat_amount" : "amount";

	return (
		<div className="space-y-2">
			{tiers.map((tier: PriceTier, index: number) => {
				const amountValue = isFlatMode ? (tier.flat_amount ?? 0) : tier.amount;

				return (
					<div
						key={`${index}-${tier.to}`}
						className="flex gap-2 w-full items-center"
					>
						<span className="text-tertiary-foreground text-xs min-w-0 w-18 shrink-0 h-full">
							{Number(includedUsage) === 0 && index === 0
								? "first"
								: "then, up to"}
						</span>

						<TierToInput index={index} />

						<CurrencyAmountInput
							className="min-w-0 w-26 shrink-0"
							currencyCode={currency}
							displayValue={amountDisplayValue(amountValue)}
							onRawChange={(raw) =>
								updateTier({
									item,
									setItem,
									index,
									field: amountField,
									value: raw,
								})
							}
						/>

						{!isFlatMode && <BillingUnits />}

						<div className="flex items-center gap-1 shrink-0">
							<IconButton
								variant="muted"
								onClick={() => removeTier({ item, setItem, index })}
								icon={<TrashIcon size={10} />}
								className="p-1 text-tertiary-foreground hover:text-red-500"
							/>
						</div>
					</div>
				);
			})}
			<IconButton
				variant="muted"
				className="w-full text-tertiary-foreground text-xs"
				size="sm"
				onClick={() => addTier({ item, setItem })}
				icon={<PlusIcon size={10} />}
			>
				Add Tier
			</IconButton>

			{org?.config?.multi_currency && (
				<TieredCurrenciesEditor
					amountField={amountField}
					baseCurrency={currency}
					item={item}
					onItemChange={setItem}
				/>
			)}
		</div>
	);
}
