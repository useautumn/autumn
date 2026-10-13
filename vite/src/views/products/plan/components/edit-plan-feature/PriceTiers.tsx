import { IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { stampBaseCurrency } from "../../utils/currencyUtils";
import { addTier, updateTierPrice } from "../../utils/tierUtils";
import { AdditionalCurrenciesEditor } from "../shared/AdditionalCurrenciesEditor";
import {
	amountDisplayValue,
	CurrencyAmountInput,
} from "../shared/CurrencyAmountInput";
import { BillingUnits } from "./BillingUnits";
import { TieredPriceEditor } from "./TieredPriceEditor";

export function PriceTiers() {
	const { item, setItem } = useProductItemContext();
	const { org } = useOrg();
	const currency = org?.default_currency?.toUpperCase() ?? "USD";

	if (!item) return null;

	const tiers = item.tiers ?? [];
	if (tiers.length === 0) return null;

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
							setItem(
								updateTierPrice({
									item,
									index: 0,
									currency,
									baseCurrency: currency,
									field: "amount",
									value: raw,
								}),
							)
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

	return <TieredPriceEditor baseCurrency={currency} />;
}
