import { type CatalogStripePrice, formatAmount } from "@autumn/shared";
import {
	InfoTooltip,
	SearchableSelect,
	Skeleton,
	SmallSpinner,
} from "@autumn/ui";
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
	return `${amount} / ${every}`;
};

/** Tiered and metered prices carry no single unit amount, so name the kind instead. */
const foundPriceHeadline = ({ price }: { price: CatalogStripePrice }) => {
	if (price.unit_amount !== null) return priceHeadline({ price });
	const label = price.nickname ?? "Usage-based";
	return price.interval ? `${label} / ${price.interval}` : label;
};

/** Null while a price is unresolved — the headline is already its id. */
const priceSubtext = ({
	price,
}: {
	price: CatalogStripePrice;
}): string | null =>
	price.unit_amount === null && !price.product_name
		? null
		: [price.id, price.product_name].filter(Boolean).join(" · ");

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

const CREATE_PRICE_VALUE = "__create";

const createPriceOption = ({
	label,
}: {
	label: string;
}): CatalogStripePrice => ({
	...unresolvedPrice({ id: CREATE_PRICE_VALUE }),
	nickname: label,
});

const isCreateOption = (price: CatalogStripePrice) =>
	price.id === CREATE_PRICE_VALUE;

/**
 * Picks the Stripe price this Autumn price bills as. With a product id it lists
 * that product's prices; otherwise search takes an exact price or product id.
 * `null` means Autumn creates the price.
 */
export const StripePriceSelect = ({
	value,
	onChange,
	stripeProductId,
	createLabel = "No price",
	disabled,
}: {
	value: string | null;
	onChange: (stripePriceId: string | null) => void;
	stripeProductId?: string | null;
	createLabel?: string;
	disabled?: boolean;
}) => {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 250 });
	const lookup = debouncedSearch.trim() || stripeProductId || "";
	const { stripePrices, isFetching } = useStripePricesSearchQuery({
		search: lookup,
	});
	// The mapped id is resolved up front so it reads like any searched result
	// rather than a bare id. Same query key as searching it, so it is a cache hit.
	const { stripePrices: mappedPrices, isFetching: isResolvingMapped } =
		useStripePricesSearchQuery({ search: value ?? "" });

	const createOption = createPriceOption({ label: createLabel });
	const isFoundInStripe =
		stripePrices.some((price) => price.id === value) ||
		mappedPrices.some((price) => price.id === value);
	const isMissingFromStripe =
		Boolean(value) && !isResolvingMapped && !isFoundInStripe;
	const selected = value
		? (stripePrices.find((price) => price.id === value) ??
			mappedPrices.find((price) => price.id === value) ??
			unresolvedPrice({ id: value }))
		: createOption;
	const isLoadingSelected =
		Boolean(value) && isResolvingMapped && !isFoundInStripe;
	const options = [
		createOption,
		...(value && !stripePrices.some((price) => price.id === value)
			? [selected]
			: []),
		...stripePrices,
	];

	return (
		<SearchableSelect<CatalogStripePrice>
			disabled={disabled}
			// Nothing to show until the id is one Stripe can actually resolve.
			emptyText={isStripeLookup(search.trim()) ? "No Stripe price found" : null}
			footer={
				isFetching || isResolvingMapped ? (
					<div className="flex items-center justify-center gap-2 border-border/60 border-t px-3 py-2 text-tertiary-foreground text-xs">
						<SmallSpinner size={12} />
						Looking up Stripe
					</div>
				) : undefined
			}
			getOptionLabel={(price) =>
				isCreateOption(price)
					? createLabel
					: (priceSubtext({ price }) ?? price.id)
			}
			getOptionValue={(price) => price.id}
			isLoading={isFetching || isResolvingMapped}
			onSearchChange={setSearch}
			onValueChange={(nextValue) =>
				onChange(nextValue === CREATE_PRICE_VALUE ? null : nextValue)
			}
			options={options}
			placeholder={createLabel}
			renderOption={(price, isSelected) => (
				<>
					{isCreateOption(price) ? (
						<span className="flex-1 text-tertiary-foreground">
							{createLabel}
						</span>
					) : (
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="flex items-center gap-2 truncate">
								{priceHeadline({ price })}
								{!price.active && (
									<span className="shrink-0 text-[10px] text-amber-500">
										inactive
									</span>
								)}
							</span>
							{priceSubtext({ price }) && (
								<span className="truncate font-mono text-tertiary-foreground text-xs">
									{priceSubtext({ price })}
								</span>
							)}
						</div>
					)}
					<CheckIcon
						className={cn(
							"size-4 shrink-0 transition-opacity",
							isSelected ? "opacity-100" : "opacity-0",
						)}
					/>
				</>
			)}
			renderValue={(price) =>
				price && !isCreateOption(price) ? (
					<span className="flex min-w-0 items-center gap-2">
						{isLoadingSelected ? (
							<Skeleton className="h-3.5 w-24 shrink-0" />
						) : isMissingFromStripe ? (
							<span className="shrink-0 text-amber-500">
								Not found in Stripe
							</span>
						) : (
							<span className="shrink-0">{foundPriceHeadline({ price })}</span>
						)}
						<span className="truncate font-mono text-tertiary-foreground text-xs">
							{price.id}
						</span>
					</span>
				) : (
					<span className="flex items-center gap-1.5 text-tertiary-foreground">
						{createLabel}
						<InfoTooltip>
							This will be created in Stripe on first attach.
						</InfoTooltip>
					</span>
				)
			}
			searchPlaceholder="Enter a price_ or prod_ ID"
			searchable
			triggerClassName="h-input"
			value={value ?? CREATE_PRICE_VALUE}
		/>
	);
};
