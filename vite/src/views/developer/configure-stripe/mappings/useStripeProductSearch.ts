import type { CatalogStripeProduct } from "@autumn/shared";
import { useState } from "react";
import { useStripeProductsSearchQuery } from "@/hooks/queries/useStripeProductsSearchQuery";
import { useDebounce } from "@/hooks/useDebounce";

const mergeStripeProducts = (...productLists: CatalogStripeProduct[][]) => {
	const productsById = new Map<string, CatalogStripeProduct>();
	for (const products of productLists) {
		for (const product of products) {
			productsById.set(product.id, product);
		}
	}
	return Array.from(productsById.values());
};

/**
 * Drives the Stripe product dropdowns: `knownStripeProducts` resolves currently
 * mapped values; `selectStripeProducts` are the searchable options.
 */
export const useStripeProductSearch = ({
	knownProducts,
	enabled,
}: {
	knownProducts: CatalogStripeProduct[];
	enabled: boolean;
}) => {
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search, delayMs: 250 });
	const {
		stripeProducts: searchedStripeProducts,
		isFetching,
		isPlaceholderData,
	} = useStripeProductsSearchQuery({ search: debouncedSearch, enabled });

	const normalizedSearch = search.trim();
	const isSearchActive = normalizedSearch.length > 0;
	const isSearchSettled = normalizedSearch === debouncedSearch.trim();
	const knownStripeProducts = mergeStripeProducts(
		knownProducts,
		searchedStripeProducts,
	);

	let selectStripeProducts = knownStripeProducts;
	if (isSearchActive) {
		selectStripeProducts =
			isSearchSettled && !isPlaceholderData ? searchedStripeProducts : [];
	}

	const isSearching =
		isSearchActive && (!isSearchSettled || isFetching || isPlaceholderData);

	return { setSearch, knownStripeProducts, selectStripeProducts, isSearching };
};
