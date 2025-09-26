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
		} else {
			setProduct(undefined);
		}
	}, [originalProduct]);

	const diff = useMemo(() => {
		if (!originalProductRef.current || !product)
			return {
				hasChanges: false,
				willVersion: false,
			};

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: originalProductRef.current as unknown as ProductV2,
			features,
		});

		// console.log("Comparison:", comparison);

		return {
			hasChanges:
				!comparison.itemsSame ||
				!comparison.detailsSame ||
				!comparison.freeTrialsSame,
			willVersion:
				!comparison.optionsSame ||
				!comparison.itemsSame ||
				!comparison.freeTrialsSame,
		};
	}, [product, features]);

	return {
		product,
		setProduct,
		hasChanges: diff.hasChanges,
		willVersion: diff.willVersion,
		originalProduct: originalProductRef.current,
	};
}
