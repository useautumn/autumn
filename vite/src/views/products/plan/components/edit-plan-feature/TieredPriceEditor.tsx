import { TierBehavior } from "@autumn/shared";
import { IconButton } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { useTierCurrencyTabs } from "../../hooks/useTierCurrencyTabs";
import { addTier } from "../../utils/tierUtils";
import { CurrencyTabs } from "./CurrencyTabs";
import { TierBehaviorSwitch } from "./TierBehaviorSwitch";
import { TierTable } from "./TierTable";
import { VolumeExampleBill } from "./VolumeExampleBill";

export function TieredPriceEditor({ baseCurrency }: { baseCurrency: string }) {
	const { item, setItem } = useProductItemContext();
	const { org } = useOrg();
	const currencyTabs = useTierCurrencyTabs({ baseCurrency });
	if (!item) return null;

	const isVolume = item.tier_behavior === TierBehavior.VolumeBased;
	const { activeCurrency } = currencyTabs;

	return (
		<div className="flex flex-col gap-3">
			<TierBehaviorSwitch />
			{org?.config?.multi_currency && (
				<CurrencyTabs
					currencies={currencyTabs.currencies}
					activeCurrency={activeCurrency}
					onSelect={currencyTabs.selectCurrency}
					onAdd={currencyTabs.addCurrency}
					onRemove={currencyTabs.removeCurrency}
				/>
			)}
			<TierTable currency={activeCurrency} baseCurrency={baseCurrency} />
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
					baseCurrency={baseCurrency}
				/>
			)}
		</div>
	);
}
