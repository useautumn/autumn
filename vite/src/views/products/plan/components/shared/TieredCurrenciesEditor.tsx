import type { PriceTier, ProductItem } from "@autumn/shared";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	cn,
	FormLabel,
	IconButton,
} from "@autumn/ui";
import { CaretDownIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { billingUnitsLabel } from "../../utils/billingUnitsUtils";
import {
	addCurrencyToTiers,
	itemCurrencyCodes,
	removeCurrencyFromTiers,
	stampBaseCurrency,
	updateTierCurrencyAmount,
} from "../../utils/currencyUtils";
import { tierToDisplay } from "../../utils/tierUtils";
import { AddCurrencyButton } from "./AddCurrencyButton";
import { amountDisplayValue, CurrencyAmountInput } from "./CurrencyAmountInput";

const tierAmountFor = ({
	tier,
	code,
	amountField,
}: {
	tier: PriceTier;
	code: string;
	amountField: "amount" | "flat_amount";
}) => {
	const entry = tier.additional_currencies?.find(
		(candidate) => candidate.currency.toLowerCase() === code,
	);
	return entry?.[amountField] ?? 0;
};

export const TieredCurrenciesEditor = ({
	item,
	onItemChange,
	baseCurrency,
	amountField,
}: {
	item: ProductItem;
	onItemChange: (item: ProductItem) => void;
	baseCurrency: string;
	amountField: "amount" | "flat_amount";
}) => {
	const [expandedCode, setExpandedCode] = useState<string | null>(null);
	const { features } = useFeaturesQuery();

	const tiers = item.tiers ?? [];
	const perUnitLabel =
		amountField === "amount" ? billingUnitsLabel({ item, features }) : null;
	const codes = itemCurrencyCodes(item);
	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;

	const applyChange = (nextItem: ProductItem) => {
		onItemChange(
			stampBaseCurrency({ item: nextItem, orgCurrency: baseCurrency }),
		);
	};

	const addCurrency = (code: string) => {
		const normalized = code.toLowerCase();
		applyChange(addCurrencyToTiers({ item, code: normalized }));
		setExpandedCode(normalized);
	};

	const removeCurrency = (code: string) => {
		applyChange(removeCurrencyFromTiers({ item, code }));
		if (expandedCode === code) setExpandedCode(null);
	};

	const summaryFor = (code: string) => {
		const setCount = tiers.filter(
			(tier) => tierAmountFor({ tier, code, amountField }) > 0,
		).length;
		if (setCount === 0) return "not set";
		return `${setCount} of ${tiers.length} set`;
	};

	return (
		<div>
			<FormLabel>Additional currencies</FormLabel>
			<div className="space-y-2">
				{codes.map((code) => {
					const isOpen = expandedCode === code;
					return (
						<Collapsible
							className="w-full rounded-lg border shadow-sm dark:bg-input/30"
							key={code}
							onOpenChange={(open) => setExpandedCode(open ? code : null)}
							open={isOpen}
						>
							<div className="flex h-input w-full items-center">
								<CollapsibleTrigger className="flex h-full flex-1 items-center justify-between px-2 outline-none">
									<span className="text-tertiary-foreground text-xs uppercase">
										{code}
									</span>
									<span className="flex items-center gap-1.5 text-tertiary-foreground text-xs">
										{summaryFor(code)}
										<CaretDownIcon
											className={cn(
												"transition-transform duration-200",
												isOpen && "rotate-180",
											)}
											size={10}
										/>
									</span>
								</CollapsibleTrigger>
								<IconButton
									className="mr-1 shrink-0 bg-transparent p-1 text-tertiary-foreground hover:bg-transparent hover:text-red-500 active:bg-transparent"
									icon={<TrashIcon size={10} />}
									onClick={() => removeCurrency(code)}
									variant="muted"
								/>
							</div>
							<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
								<div className="space-y-2 p-2 pt-0">
									{tiers.map((tier, index) => {
										const amount = tierAmountFor({ tier, code, amountField });
										const boundary = tierToDisplay({ tier, includedUsage });
										return (
											<div
												className="flex items-center gap-2"
												key={`${code}-${index}`}
											>
												<span className="w-18 shrink-0 text-tertiary-foreground text-xs">
													{index === 0 && includedUsage === 0
														? `first ${boundary}`
														: `up to ${boundary}`}
												</span>
												<CurrencyAmountInput
													currencyCode={code}
													displayValue={amountDisplayValue(amount)}
													onRawChange={(raw) =>
														applyChange(
															updateTierCurrencyAmount({
																item,
																tierIndex: index,
																code,
																field: amountField,
																value: raw,
															}),
														)
													}
												/>
												{perUnitLabel && (
													<span className="max-w-20 shrink-0 truncate text-tertiary-foreground text-xs">
														{perUnitLabel}
													</span>
												)}
											</div>
										);
									})}
								</div>
							</CollapsibleContent>
						</Collapsible>
					);
				})}
				<AddCurrencyButton
					baseCurrency={baseCurrency}
					currencyCodes={codes}
					onSelect={addCurrency}
				/>
			</div>
		</div>
	);
};
