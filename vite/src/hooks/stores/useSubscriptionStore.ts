import {
	cusProductToProduct,
	type FullCusProduct,
	mapToProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export const useEntity = () => {
	const [{ entity_id }, setQueryStates] = useQueryStates({
		entity_id: parseAsString,
	});

	const setEntityId = (entityId: string | null) => {
		setQueryStates({ entity_id: entityId });
	};

	return { entityId: entity_id, setEntityId };
};

export const useSubscriptionById = ({ itemId }: { itemId: string | null }) => {
	const { customer } = useCusQuery();
	const queryClient = useQueryClient();

	const cusProduct = useMemo(() => {
		if (!itemId) return null;

		const fromInline = customer?.customer_products?.find(
			(p: FullCusProduct) => p.id === itemId,
		);
		if (fromInline) return fromInline;

		const cached = queryClient.getQueriesData<{ list?: FullCusProduct[] }>({
			queryKey: ["customer-products"],
		});
		for (const [, data] of cached) {
			const match = data?.list?.find((p) => p.id === itemId);
			if (match) return match;
		}
		return null;
	}, [itemId, customer?.customer_products, queryClient]);

	const productV2 = useMemo(() => {
		if (!cusProduct) return null;
		const fullProduct = cusProductToProduct({ cusProduct });
		const mapped = mapToProductV2({ product: fullProduct });
		return productV2ToFrontendProduct({ product: mapped });
	}, [cusProduct]);

	return { cusProduct, productV2 };
};
