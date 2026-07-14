import {
	Infinite,
	type PriceTier,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import {
	IconButton,
	Input,
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@autumn/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	addCurrencyToTiers,
	itemCurrencyCodes,
	removeCurrencyFromTiers,
	stampBaseCurrency,
	updateTierCurrencyAmount,
} from "../../utils/currencyUtils";
import {
	addTier,
	removeTier,
	updateTier,
	type VolumePricingMode,
} from "../../utils/tierUtils";
import { AdditionalCurrenciesEditor } from "../shared/AdditionalCurrenciesEditor";
import { CurrencyPicker } from "../shared/CurrencyPicker";
import { BillingUnits } from "./BillingUnits";

const getTierToDisplay = ({
	tiers,
	index,
	includedUsage,
}: {
	tiers: PriceTier[];
	index: number;
	includedUsage: number | string | null;
}) => {
	const tier = tiers[index];
	if (!tier) return "0";

	// 1. If infinite, return "∞"
	if (tier.to === Infinite) return "∞";

	// 2. Return tier.to + includedUsage
	if (typeof includedUsage === "number" && includedUsage > 0) {
		return ((tier.to || 0) + includedUsage).toString();
	}

	// 3. Return tier.to + 0
	return (tier.to || 0).toString();
};

const TierToInput = ({ index }: { index: number }) => {
	const { item, setItem } = useProductItemContext();
	const tiers = item?.tiers || [];
	const includedUsage =
		typeof item?.included_usage === "number" ? item?.included_usage : 0;

	const isInfinite = index === tiers.length - 1;

	const handleInputBlur = (value: string) => {
		if (isInfinite) return;
		// Set tier value in tiers array...
		const valueWithIncludedUsage =
			parseFloat(value) -
			(typeof includedUsage === "number" ? includedUsage : 0);
		const newTiers = [...tiers];
		newTiers[index] = { ...newTiers[index], to: valueWithIncludedUsage };
		setItem({ ...item, tiers: newTiers });
	};

	const [tierVal, setTierVal] = useState<string>(
		getTierToDisplay({ tiers, index, includedUsage }),
	);

	return (
		<Input
			// value={isInfinite ? "∞" : getDisplayValue(toKey, tier.to)}
			value={tierVal}
			// onFocus={() =>
			// 	!isInfinite && handleInputFocus(toKey, tier.to)
			// }
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
	// Track raw input values during editing
	const [editingValues, setEditingValues] = useState<Record<string, string>>(
		{},
	);
	const [isEditing, setIsEditing] = useState<Record<string, boolean>>({});

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

	// Helper functions for managing input editing state
	const handleInputFocus = (key: string, currentValue: number | string) => {
		setIsEditing((prev) => ({ ...prev, [key]: true }));
		setEditingValues((prev) => ({
			...prev,
			[key]: currentValue === 0 ? "" : currentValue.toString(),
		}));
	};

	const handleInputBlur = (
		key: string,
		field: "amount" | "to" | "flat_amount",
		tierIndex?: number,
	) => {
		const rawValue = editingValues[key] || "";
		setIsEditing((prev) => ({ ...prev, [key]: false }));

		if (tierIndex !== undefined) {
			updateTier({ item, setItem, index: tierIndex, field, value: rawValue });
		}
	};

	const handleInputChange = (
		key: string,
		value: string,
		field: "amount" | "to" | "flat_amount",
		tierIndex?: number,
	) => {
		setEditingValues((prev) => ({ ...prev, [key]: value }));

		// Live update the item as user types
		if (tierIndex !== undefined) {
			updateTier({ item, setItem, index: tierIndex, field, value });
		}
	};

	const getDisplayValue = (key: string, actualValue: number | string) => {
		if (isEditing[key]) {
			return editingValues[key] || "";
		}
		return actualValue === 0 ? "" : actualValue.toString();
	};

	// Only show pricing UI if billing type is "priced" (has tiers)
	if (!tiers || tiers.length === 0) {
		return null;
	}

	// Simple single tier UI - just amount input with billing units
	if (tiers.length === 1) {
		const firstTier = tiers[0];
		const amountKey = "single-tier-amount";

		return (
			<div className="space-y-2">
				<div className="flex gap-2 w-full items-center">
					<InputGroup>
						<InputGroupInput
							value={getDisplayValue(amountKey, firstTier.amount)}
							onFocus={() => handleInputFocus(amountKey, firstTier.amount)}
							onBlur={() => handleInputBlur(amountKey, "amount", 0)}
							onChange={(e) =>
								handleInputChange(amountKey, e.target.value, "amount", 0)
							}
							inputMode="decimal"
							placeholder="0.00"
							onKeyDown={(e) => {
								// Prevent typing minus sign
								if (e.key === "-" || e.key === "Minus") {
									e.preventDefault();
								}
							}}
						/>
						<InputGroupAddon align="inline-end">
							<span className="text-tertiary-foreground text-xs">
								{currency}
							</span>
						</InputGroupAddon>
					</InputGroup>

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
	const currencyCodes = itemCurrencyCodes(item);

	const addCurrency = (code: string) => {
		setItem(
			stampBaseCurrency({
				item: addCurrencyToTiers({ item, code: code.toLowerCase() }),
				orgCurrency: currency,
			}),
		);
	};

	return (
		<div className="space-y-2">
			{tiers.map((tier: PriceTier, index: number) => {
				const amountKey = `tier-${index}-${amountField}`;
				const amountValue = isFlatMode ? (tier.flat_amount ?? 0) : tier.amount;

				return (
					<div
						key={`${index}-${tier.to}`}
						className="flex flex-wrap gap-2 w-full items-center"
					>
						<span className="text-tertiary-foreground text-xs min-w-0 w-18 shrink-0 h-full">
							{Number(includedUsage) === 0 && index === 0
								? "first"
								: "then, up to"}
						</span>

						<TierToInput index={index} />

						<InputGroup className="min-w-0 w-26 shrink-0">
							<InputGroupInput
								value={getDisplayValue(amountKey, amountValue)}
								onFocus={() => handleInputFocus(amountKey, amountValue)}
								onBlur={() => handleInputBlur(amountKey, amountField, index)}
								onChange={(e) =>
									handleInputChange(
										amountKey,
										e.target.value,
										amountField,
										index,
									)
								}
								inputMode="decimal"
								placeholder="0.00"
							/>
							<InputGroupAddon align="inline-end">
								<span className="text-tertiary-foreground text-xs">
									{currency}
								</span>
							</InputGroupAddon>
						</InputGroup>

						{currencyCodes.map((code) => {
							const entry = tier.additional_currencies?.find(
								(candidate) => candidate.currency.toLowerCase() === code,
							);
							const entryValue = isFlatMode
								? (entry?.flat_amount ?? 0)
								: (entry?.amount ?? 0);
							const entryKey = `tier-${index}-${code}-${amountField}`;

							return (
								<InputGroup key={code} className="min-w-0 w-26 shrink-0">
									<InputGroupInput
										value={getDisplayValue(entryKey, entryValue)}
										onFocus={() => handleInputFocus(entryKey, entryValue)}
										onBlur={() =>
											setIsEditing((prev) => ({ ...prev, [entryKey]: false }))
										}
										onChange={(e) => {
											setEditingValues((prev) => ({
												...prev,
												[entryKey]: e.target.value,
											}));
											setItem(
												stampBaseCurrency({
													item: updateTierCurrencyAmount({
														item,
														tierIndex: index,
														code,
														field: amountField,
														value: e.target.value,
													}),
													orgCurrency: currency,
												}),
											);
										}}
										inputMode="decimal"
										placeholder="0.00"
									/>
									<InputGroupAddon align="inline-end">
										<span className="text-tertiary-foreground text-xs uppercase">
											{code}
										</span>
									</InputGroupAddon>
								</InputGroup>
							);
						})}

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
				<div className="flex flex-wrap items-center gap-2">
					<CurrencyPicker
						excludedCodes={[currency, ...currencyCodes]}
						label="Add currency"
						onSelect={addCurrency}
					/>
					{currencyCodes.map((code) => (
						<IconButton
							className="text-tertiary-foreground text-xs uppercase"
							icon={<TrashIcon size={10} />}
							key={code}
							onClick={() =>
								setItem(
									stampBaseCurrency({
										item: removeCurrencyFromTiers({ item, code }),
										orgCurrency: currency,
									}),
								)
							}
							variant="muted"
						>
							{code}
						</IconButton>
					))}
				</div>
			)}
		</div>
	);
}
