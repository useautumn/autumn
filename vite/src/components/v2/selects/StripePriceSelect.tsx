import { type CatalogStripePrice, formatAmount } from "@autumn/shared";
import { SearchableSelect, SmallSpinner } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import {
	isStripeLookup,
	useStripePricesSearchQuery,
} from "@/hooks/queries/useStripePricesSearchQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

/** Amount and interval — what the price actually charges. */
const priceHeadline = ({ price }: { price: CatalogStripePrice }) => {
	if (price.unit_amount === null) return price.id;

	const amount = formatAmount({
		currency: price.currency,
		amount: price.unit_amount / 100,
		minFractionDigits: 2,
		maxFractionDigits: 2,
	});
	if (!price.interval) return amount;

	const every =
		price.interval_count && price.interval_count > 1
			? `${price.interval_count} ${price.interval}s`
			: price.interval;
	return `${amount} every ${every}`;
};

const priceSubtext = ({ price }: { price: CatalogStripePrice }) =>
	[price.id, price.product_name].filter(Boolean).join(" · ");

const unresolvedPrice = ({ id }: { id: string }): CatalogStripePrice => ({
	id,
	nickname: null,
	unit_amount: null,
	currency: "usd",
	interval: null,
	interval_count: null,
	active: true,
	product_id: null,
	product_name: null,
});

/**
 * Picks the Stripe price this Autumn price bills as. Search takes an exact
 * price id, or a product id to list everything under it — Stripe cannot match
 * price ids by substring, so there is nothing to type-ahead.
 */
export const StripePriceSelect = ({
	value,
	onChange,
	disabled,
}: {
	value: string | null;
	onChange: (stripePriceId: string) => void;
	disabled?: boolean;
}) => {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 250 });
	const { stripePrices, isFetching } = useStripePricesSearchQuery({
		search: debouncedSearch,
	});

	const isResolved = stripePrices.some((price) => price.id === value);
	const options = [
		...(value && !isResolved ? [unresolvedPrice({ id: value })] : []),
		...stripePrices,
	];

	return (
		<SearchableSelect<CatalogStripePrice>
			disabled={disabled}
			// Nothing to show until the id is one Stripe can actually resolve.
			emptyText={isStripeLookup(search.trim()) ? "No Stripe price found" : null}
			footer={
				isFetching ? (
					<div className="flex items-center justify-center gap-2 border-border/60 border-t px-3 py-2 text-tertiary-foreground text-xs">
						<SmallSpinner size={12} />
						Looking up Stripe
					</div>
				) : undefined
			}
			getOptionLabel={(price) => priceSubtext({ price })}
			getOptionValue={(price) => price.id}
			isLoading={isFetching}
			onSearchChange={setSearch}
			onValueChange={onChange}
			options={options}
			placeholder="Not mapped"
			renderOption={(price, isSelected) => (
				<>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="flex items-center gap-2 truncate">
							{priceHeadline({ price })}
							{!price.active && (
								<span className="shrink-0 text-[10px] text-amber-500">
									inactive
								</span>
							)}
						</span>
						<span className="truncate font-mono text-tertiary-foreground text-xs">
							{priceSubtext({ price })}
						</span>
					</div>
					<CheckIcon
						className={cn(
							"size-4 shrink-0 transition-opacity",
							isSelected ? "opacity-100" : "opacity-0",
						)}
					/>
				</>
			)}
			renderValue={(price) =>
				price ? (
					<span className="truncate font-mono text-xs">{price.id}</span>
				) : (
					<span className="text-tertiary-foreground">Not mapped</span>
				)
			}
			searchPlaceholder="Enter a price_ or prod_ ID"
			searchable
			triggerClassName="h-input"
			value={value}
		/>
	);
};
