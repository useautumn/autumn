import type { AdditionalCurrencyPrice, FrontendProduct } from "@autumn/shared";
import {
	type AdminPlanIds,
	AdminPlanIdsTooltip,
} from "@/components/forms/shared/admin/AdminPlanIdsTooltip";
import { PriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import {
	AdditionalCurrenciesHint,
	type CurrencyChangeState,
} from "@/views/products/plan/components/plan-card/AdditionalCurrenciesHint";

interface PriceChange {
	oldPrice: string;
	newPrice: string;
	oldIntervalText: string | null;
	newIntervalText: string | null;
	oldCurrencies?: AdditionalCurrencyPrice[];
	newCurrencies?: AdditionalCurrencyPrice[];
	oldCurrencyStates?: Record<string, CurrencyChangeState>;
	newCurrencyStates?: Record<string, CurrencyChangeState>;
	isUpgrade: boolean;
}

export function PlanPriceHeader({
	priceChange,
	product,
	currency,
	adminIds,
}: {
	priceChange?: PriceChange | null;
	product: FrontendProduct | undefined;
	currency: string;
	adminIds?: AdminPlanIds;
}) {
	const content = priceChange ? (
		<span className="flex items-center gap-1.5">
			<ItemStatusDot state="updated" />
			<span className="text-tertiary-foreground">
				{priceChange.oldPrice}
				{priceChange.oldIntervalText && ` ${priceChange.oldIntervalText}`}
			</span>
			{!!priceChange.oldCurrencies?.length && (
				<AdditionalCurrenciesHint
					changeStates={priceChange.oldCurrencyStates}
					currencies={priceChange.oldCurrencies}
				/>
			)}
			<span className="text-subtle">-&gt;</span>
			<span className="font-semibold text-foreground">
				{priceChange.newPrice}
			</span>
			<span className="text-tertiary-foreground">
				{priceChange.newIntervalText}
			</span>
			{!!priceChange.newCurrencies?.length && (
				<AdditionalCurrenciesHint
					changeStates={priceChange.newCurrencyStates}
					currencies={priceChange.newCurrencies}
				/>
			)}
		</span>
	) : (
		<PriceDisplay product={product} currency={currency} />
	);

	const wrapped = adminIds ? (
		<AdminPlanIdsTooltip ids={adminIds}>
			<span className="inline-flex">{content}</span>
		</AdminPlanIdsTooltip>
	) : (
		content
	);

	return (
		<div className="flex gap-2 justify-between items-center mb-1">
			{wrapped}
		</div>
	);
}
