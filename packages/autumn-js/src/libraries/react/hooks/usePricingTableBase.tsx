import type Autumn from "@sdk";
import useSWR, { type SWRConfiguration } from "swr";
import type { ConvexAutumnClient } from "../client/ConvexAutumnClient";
import type { AutumnClient } from "../client/ReactAutumnClient";
import type {
	ProductDetails,
	ProductWithDisplay,
} from "../client/ProductDetails";

const mergeProductDetails = (
	products: Autumn.Product[] | undefined,
	productDetails?: ProductDetails[],
): ProductWithDisplay[] | null => {
	if (!products) {
		return null;
	}

	if (!productDetails) {
		return products.map((product) => {
			if (product.base_variant_id) {
				const baseProduct = products.find(
					(p) => p.id === product.base_variant_id,
				);
				if (baseProduct) {
					return {
						...product,
						name: baseProduct.name,
					};
				}
			}

			return product;
		});
	}

	const fetchedProducts = structuredClone(products);

	const mergedProducts: ProductWithDisplay[] = [];

	for (const overrideDetails of productDetails) {
		if (!overrideDetails.id) {
			const properties: any = {};
			let overrideItems = overrideDetails.items?.map((item) => ({
				display: {
					primary_text: item.primaryText,
					secondary_text: item.secondaryText,
				},
			}));

			const overridePrice = overrideDetails.price;
			if (overrideDetails.price) {
				properties.is_free = false;
				overrideItems = [
					{
						display: {
							primary_text: overridePrice?.primaryText,
							secondary_text: overridePrice?.secondaryText,
						},
					},
					...(overrideItems || []),
				];
			}

			if (!overrideItems || overrideItems.length === 0) {
				overrideItems = [
					{
						display: {
							primary_text: "",
						},
					},
				] as any;
			}

			mergedProducts.push({
				display: {
					name: overrideDetails.name,
					description: overrideDetails.description,
					button_text: overrideDetails.buttonText,
					recommend_text: overrideDetails.recommendText,
					everything_from: overrideDetails.everythingFrom,
					button_url: overrideDetails.buttonUrl,
				},
				items: overrideItems,
				properties,
			} as unknown as Autumn.Product);
			continue;
		}

		const fetchedProduct = fetchedProducts.find(
			(p) => p.id === overrideDetails.id,
		);

		if (!fetchedProduct) {
			continue;
		}

		let displayName = fetchedProduct.name;
		const baseVariantId = fetchedProduct.base_variant_id;
		if (baseVariantId) {
			const baseProduct = fetchedProducts.find((p) => p.id === baseVariantId);
			if (baseProduct) {
				displayName = baseProduct.name;
			}
		}
		displayName = overrideDetails.name || displayName;

		const originalIsFree = fetchedProduct.properties?.is_free;
		const overrideProperties = fetchedProduct.properties || {};
		const overrideItems = overrideDetails.items;
		const overridePrice = overrideDetails.price;
		let mergedItems: Autumn.Products.ProductItem[] = [];

		if (overridePrice) {
			// overrideProperties.is_free = false;

			if (originalIsFree || overrideItems !== undefined) {
				mergedItems.push({
					display: {
						primary_text: overridePrice.primaryText,
						secondary_text: overridePrice.secondaryText,
					},
				});
			} else {
				fetchedProduct.items[0].display = {
					primary_text: overridePrice.primaryText,
					secondary_text: overridePrice.secondaryText,
				};
			}
		} else {
			if (overrideItems && !originalIsFree) {
				mergedItems.push(fetchedProduct.items[0]);
			}
		}

		if (overrideItems) {
			for (const overrideItem of overrideItems) {
				if (!overrideItem.featureId) {
					mergedItems.push({
						display: {
							primary_text: overrideItem.primaryText || "",
							secondary_text: overrideItem.secondaryText,
						},
					});
				} else {
					const fetchedItem = fetchedProduct.items.find(
						(i) => i.feature_id === overrideItem.featureId,
					);
					if (!fetchedItem) {
						console.error(
							`Feature with id ${overrideItem.featureId} not found for product ${fetchedProduct.id}`,
						);
						continue;
					}
					mergedItems.push({
						...fetchedItem,
						display: {
							primary_text:
								overrideItem.primaryText ||
								fetchedItem.display?.primary_text ||
								"",
							secondary_text:
								overrideItem.secondaryText ||
								fetchedItem.display?.secondary_text,
						},
					});
				}
			}
		} else {
			mergedItems = fetchedProduct.items;
		}

		const mergedProduct: Autumn.Product & {
			display: {
				name?: string;
				description?: string;
				button_text?: string;
				recommend_text?: string;
				everything_from?: string;
				button_url?: string;
			};
		} = {
			...fetchedProduct,
			items: mergedItems,
			properties: overrideProperties as Autumn.Product["properties"],
			display: {
				name: displayName,
				description: overrideDetails.description,
				button_text: overrideDetails.buttonText,
				recommend_text: overrideDetails.recommendText,
				everything_from: overrideDetails.everythingFrom,
				button_url: overrideDetails.buttonUrl,
			},
		};

		mergedProducts.push(mergedProduct);
	}
	return mergedProducts;
};

const defaultSWRConfig: SWRConfiguration = {
	refreshInterval: 0,
};

export const usePricingTableBase = ({
	client,
	params,
}: {
	client: AutumnClient | ConvexAutumnClient;
	params?: {
		productDetails?: ProductDetails[];
	};
}) => {
	const fetcher = async () => {
		const data = await client.products.list();

		return data?.list || [];
	};

	const { data, error, mutate } = useSWR<Autumn.Product[]>(
		["pricing-table", client.backendUrl],
		fetcher,
		{ ...defaultSWRConfig },
	);

	return {
		products: mergeProductDetails(data || [], params?.productDetails),
		isLoading: !error && !data,
		error,
		refetch: mutate,
	};
};
