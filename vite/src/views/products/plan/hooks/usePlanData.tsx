import {
	type FrontendProduct,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

interface UsePlanDataProps {
	originalProduct?: FrontendProduct;
}

export function usePlanData({ originalProduct }: UsePlanDataProps) {
	const originalProductRef = useRef<FrontendProduct | undefined>(
		originalProduct,
	);
	const [product, setProduct] = useState<FrontendProduct | undefined>(
		originalProduct,
	);

	const { features = [] } = useFeaturesQuery();

	useEffect(() => {
		if (originalProduct) {
			originalProductRef.current = originalProduct;
			setProduct(originalProduct);
		}
	}, [originalProduct]);

	const hasChanges = useMemo(() => {
		if (!originalProductRef.current || !product) return false;

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: originalProductRef.current as unknown as ProductV2,
			features,
		});

		// console.log("Comparison:", comparison);

		return !comparison.itemsSame || !comparison.freeTrialsSame;
	}, [product, features]);

	return {
		product,
		setProduct,
		hasChanges,
		originalProduct: originalProductRef.current,
	};
}
