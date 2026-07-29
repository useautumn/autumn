import type { CatalogStripeProduct } from "@autumn/shared";
import { SearchableSelect, SmallSpinner } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_PRODUCT_VALUE = "__none";

type StripeProductOption =
	| CatalogStripeProduct
	| {
			id: typeof NO_PRODUCT_VALUE;
			name: string;
			active: true;
	  };

const noProductOption: StripeProductOption = {
	id: NO_PRODUCT_VALUE,
	name: "No Stripe product",
	active: true,
};

const getProductLabel = (product: StripeProductOption) => {
	if (product.id === NO_PRODUCT_VALUE) return product.name;
	return product.name ? `${product.name} ${product.id}` : product.id;
};

export const StripeProductSelect = ({
	value,
	products,
	knownProducts = [],
	onChange,
	onSearchChange,
	isLoading,
	disabled,
}: {
	value: string | null;
	products: CatalogStripeProduct[];
	// Used only to resolve the selected value's display name (e.g. lazily
	// resolved products not present in the search-filtered options).
	knownProducts?: CatalogStripeProduct[];
	onChange: (value: string | null) => void;
	onSearchChange: (search: string) => void;
	isLoading?: boolean;
	disabled?: boolean;
}) => {
	const selectedProduct =
		products.find((product) => product.id === value) ??
		knownProducts.find((product) => product.id === value);
	const selectedOption =
		value && !selectedProduct
			? [{ id: value, name: null, active: true } satisfies CatalogStripeProduct]
			: value && !products.some((product) => product.id === value)
				? [selectedProduct as CatalogStripeProduct]
				: [];
	const options: StripeProductOption[] = [
		noProductOption,
		...selectedOption,
		...products,
	];

	return (
		<SearchableSelect<StripeProductOption>
			value={value ?? NO_PRODUCT_VALUE}
			onValueChange={(nextValue) =>
				onChange(nextValue === NO_PRODUCT_VALUE ? null : nextValue)
			}
			options={options}
			getOptionValue={(product) => product.id}
			getOptionLabel={getProductLabel}
			placeholder="Select Stripe product"
			searchable
			searchPlaceholder="Search Stripe products..."
			emptyText="No Stripe products found"
			onSearchChange={onSearchChange}
			isLoading={isLoading}
			footer={
				isLoading && options.length > 0 ? (
					<div className="flex items-center justify-center gap-2 border-t border-border/60 px-3 py-2 text-xs text-tertiary-foreground">
						<SmallSpinner size={12} />
						Searching Stripe products
					</div>
				) : undefined
			}
			disabled={disabled}
			triggerClassName="h-input"
			renderValue={(product) => {
				if (!product || product.id === NO_PRODUCT_VALUE) {
					return (
						<span className="text-tertiary-foreground">No Stripe product</span>
					);
				}

				return (
					<span className="flex min-w-0 items-center gap-2">
						<span className="truncate">{product.name ?? product.id}</span>
						{product.name && (
							<span className="shrink-0 font-mono text-xs text-tertiary-foreground">
								{product.id}
							</span>
						)}
					</span>
				);
			}}
			renderOption={(product, isSelected) => {
				if (product.id === NO_PRODUCT_VALUE) {
					return (
						<>
							<span className="flex-1 text-tertiary-foreground">
								No Stripe product
							</span>
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					);
				}

				return (
					<>
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<span className="truncate">{product.name ?? product.id}</span>
							{product.name && (
								<span className="shrink-0 font-mono text-xs text-tertiary-foreground">
									{product.id}
								</span>
							)}
							{!product.active && (
								<span className="shrink-0 text-[10px] text-amber-500">
									inactive
								</span>
							)}
						</div>
						<CheckIcon
							className={cn(
								"size-4 shrink-0 transition-opacity",
								isSelected ? "opacity-100" : "opacity-0",
							)}
						/>
					</>
				);
			}}
		/>
	);
};
