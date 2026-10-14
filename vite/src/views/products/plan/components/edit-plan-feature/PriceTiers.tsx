import { numberWithCommas, TierBehavior } from "@autumn/shared";
import { IconButton, Input } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { featureUnitName } from "../../utils/billingUnitsUtils";
import {
	itemCurrencyCodes,
	stampBaseCurrency,
} from "../../utils/currencyUtils";
import {
	addTier,
	applyTierToDisplayValue,
	tierGridClassName,
	tierRowKey,
	tierToDisplay,
	updateTier,
} from "../../utils/tierUtils";
import { AdditionalCurrenciesEditor } from "../shared/AdditionalCurrenciesEditor";
import {
	amountDisplayValue,
	CurrencyAmountInput,
} from "../shared/CurrencyAmountInput";
import { BillingUnits } from "./BillingUnits";
import { CurrencyTabs } from "./CurrencyTabs";
import { TierBehaviorSwitch } from "./TierBehaviorSwitch";
import { TierTableRow } from "./TierTableRow";
import { VolumeExampleBill } from "./VolumeExampleBill";

const TierToInput = ({ index }: { index: number }) => {
	const { item, setItem } = useProductItemContext();
	const tiers = item?.tiers || [];
	const includedUsage =
		typeof item?.included_usage === "number" ? item?.included_usage : 0;

	const isInfinite = index === tiers.length - 1;

	const commitDisplayTo = (value: string) => {
		const displayValue = value.replace(/,/g, "");
		setItem(applyTierToDisplayValue({ item, index, displayValue }));
	};

	const [tierVal, setTierVal] = useState<string>(
		numberWithCommas(
			Number(tierToDisplay({ tier: tiers[index], includedUsage })),
		),
	);

	return (
		<Input
			value={tierVal}
			onBlur={() => commitDisplayTo(tierVal)}
			onChange={(e) => {
				setTierVal(e.target.value);
				commitDisplayTo(e.target.value);
			}}
			className="w-full"
			placeholder={isInfinite ? "∞" : "100"}
			inputMode="decimal"
			disabled={isInfinite || (tiers.length === 2 && index === 1)} // Disable infinity or 2nd tier in 2-tier setup
		/>
	);
};

export function PriceTiers({
	onTierBehaviorChange,
}: {
	onTierBehaviorChange: (tierBehavior: string) => void;
}) {
	const { item, setItem } = useProductItemContext();
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const [selectedCurrency, setSelectedCurrency] = useState("");
	const currency = org?.default_currency?.toUpperCase() ?? "USD";

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
						className="min-w-32 flex-1"
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

	const feature = features.find((feature) => feature.id === item.feature_id);
	const isVolume = item.tier_behavior === TierBehavior.VolumeBased;
	const baseCode = currency.toLowerCase();
	const activeCurrency = itemCurrencyCodes(item).includes(selectedCurrency)
		? selectedCurrency
		: baseCode;
	const rowClassName = tierGridClassName(isVolume);
	const units = featureUnitName({ feature, plural: true });

	return (
		<div className="flex flex-col gap-3">
			<TierBehaviorSwitch
				tierBehavior={item.tier_behavior ?? TierBehavior.Graduated}
				unit={featureUnitName({ feature, plural: false })}
				onChange={onTierBehaviorChange}
			/>
			{org?.config?.multi_currency && (
				<CurrencyTabs
					baseCurrency={currency}
					activeCurrency={activeCurrency}
					onSelect={setSelectedCurrency}
				/>
			)}
			{Number(includedUsage) > 0 && (
				<p className="text-tertiary-foreground text-xs tabular-nums">
					First {numberWithCommas(Number(includedUsage))} {units} included free.
					Tiers start after.
				</p>
			)}
			<div className="flex flex-col rounded-xl border border-table-tray-border bg-table-tray p-1 tabular-nums">
				<div
					className={cn(
						rowClassName,
						"h-7 border border-transparent text-tertiary-foreground text-xs",
					)}
				>
					<span>Up to</span>
					<BillingUnits asColumnHeader />
					{isVolume && <span>Flat fee</span>}
				</div>
				<div className="flex flex-col divide-y divide-table-surface-border overflow-hidden rounded-lg border border-table-surface-border bg-table-surface">
					{tiers.map((tier, index) => (
						<TierTableRow
							key={tierRowKey(tier, index)}
							index={index}
							currency={activeCurrency}
							baseCurrency={currency}
							className={rowClassName}
							showsFlatFee={isVolume}
						>
							{index === tiers.length - 1 ? (
								<span className="px-2 text-sm text-tertiary-foreground">
									Unlimited
								</span>
							) : (
								<TierToInput index={index} />
							)}
						</TierTableRow>
					))}
				</div>
			</div>
			<IconButton
				variant="muted"
				size="sm"
				className="w-full border border-border border-dashed bg-transparent text-tertiary-foreground text-xs"
				onClick={() => addTier({ item, setItem })}
				icon={<PlusIcon size={10} />}
			>
				Add tier
			</IconButton>
			{isVolume && (
				<VolumeExampleBill
					currency={activeCurrency}
					baseCurrency={currency}
					unitName={units}
				/>
			)}
		</div>
	);
}
