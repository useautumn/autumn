import type { CatalogStripeProduct } from "@autumn/shared";
import { SearchableSelect, SmallSpinner } from "@autumn/ui";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NO_PRODUCT_VALUE = "__none";
/** Emitted when the user picks the "create a new Stripe product" option. */
export const CREATE_STRIPE_PRODUCT = "__create";

type StripeProductOption = CatalogStripeProduct;

const isPlaceholderOption = (product: StripeProductOption) =>
	product.id === NO_PRODUCT_VALUE || product.id === CREATE_STRIPE_PRODUCT;

const getProductLabel = (product: StripeProductOption) => {
	if (isPlaceholderOption(product)) return product.name ?? "";
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
	noneLabel = "No Stripe product",
	createLabel,
	isResolving = false,
	defaultProductId = null,
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
	/** Label for the `null` choice, e.g. "Same as Pro" when null means inherit. */
	noneLabel?: string;
	createLabel?: string;
	/** While true, an unknown selected id is still loading rather than missing. */
	isResolving?: boolean;
	/** Tags this product's row so it's clear which one the default choice uses. */
	defaultProductId?: string | null;
}) => {
	const noProductOption: StripeProductOption = {
		id: NO_PRODUCT_VALUE,
		name: noneLabel,
		active: true,
	};
	const createOptions: StripeProductOption[] = createLabel
		? [{ id: CREATE_STRIPE_PRODUCT, name: createLabel, active: true }]
		: [];
	const selectedProduct =
		products.find((product) => product.id === value) ??
		knownProducts.find((product) => product.id === value);
	const selectedOption =
		value === CREATE_STRIPE_PRODUCT
			? []
			: value && !selectedProduct
				? [
						{
							id: value,
							name: null,
							active: true,
						} satisfies CatalogStripeProduct,
					]
				: value && !products.some((product) => product.id === value)
					? [selectedProduct as CatalogStripeProduct]
					: [];
	const options: StripeProductOption[] = [
		noProductOption,
		...createOptions,
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
			searchPlaceholder="Search by name or prod_ ID..."
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
			contentClassName="min-w-90"
			renderValue={(product) => {
				if (!product || isPlaceholderOption(product)) {
					return (
						<span className="text-tertiary-foreground">
							{product?.name ?? noneLabel}
						</span>
					);
				}

				// Resolved products always carry a name; a nameless one Stripe never returned.
				if (!product.name && !isResolving) {
					return (
						<span className="flex min-w-0 items-center gap-2">
							<span className="shrink-0 text-amber-500">
								Not found in Stripe
							</span>
							<span className="min-w-0 truncate font-mono text-tertiary-foreground text-xs">
								{product.id}
							</span>
						</span>
					);
				}

				return (
					<span className="flex min-w-0 items-center gap-2">
						<span className="max-w-[70%] shrink-0 truncate">
							{product.name ?? product.id}
						</span>
						{product.name && (
							<span className="min-w-0 truncate font-mono text-tertiary-foreground text-xs">
								{product.id}
							</span>
						)}
					</span>
				);
			}}
			renderOption={(product, isSelected) => {
				if (isPlaceholderOption(product)) {
					return (
						<>
							<span className="flex-1 text-tertiary-foreground">
								{product.name}
							</span>
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</>
					);
				}

				return (
					<>
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate">{product.name ?? product.id}</span>
							{product.name && (
								<span className="truncate font-mono text-tertiary-foreground text-xs">
									{product.id}
								</span>
							)}
						</div>
						{!product.active && (
							<span className="shrink-0 text-amber-500 text-xs">Inactive</span>
						)}
						{product.id === defaultProductId && (
							<span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-tertiary-foreground text-xs">
								Default
							</span>
						)}
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
