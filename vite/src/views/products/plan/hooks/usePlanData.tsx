import {
	type FrontendProduct,
	type ProductV2,
	productsAreSame,
} from "@autumn/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

interface UsePlanDataProps {
	originalProduct?: FrontendProduct | ProductV2;
}

export function usePlanData({ originalProduct }: UsePlanDataProps) {
	const originalProductRef = useRef<FrontendProduct | ProductV2 | undefined>(
		originalProduct,
	);
	const [product, setProduct] = useState<
		FrontendProduct | ProductV2 | undefined
	>(originalProduct);

	const { features = [] } = useFeaturesQuery();

	useEffect(() => {
		console.log("[usePlanData] originalProduct changed:", {
			id: originalProduct?.id,
			items: originalProduct?.items?.length || 0,
		});
		if (originalProduct) {
			originalProductRef.current = originalProduct;
			setProduct(originalProduct);
		} else {
			setProduct(undefined);
		}
	}, [originalProduct]);

	const diff = useMemo(() => {
		if (!originalProductRef.current || !product) {
			console.log("[usePlanData] No product or original, no changes");
			return {
				hasChanges: false,
				willVersion: false,
			};
		}

		const comparison = productsAreSame({
			newProductV2: product as unknown as ProductV2,
			curProductV2: originalProductRef.current as unknown as ProductV2,
			features,
		});

		console.log("[usePlanData] Comparison:", {
			comparison,
			originalId: originalProductRef.current.id,
			currentId: product.id,
			originalItems: originalProductRef.current.items?.length || 0,
			currentItems: product.items?.length || 0,
		});

		console.log("[usePlanData] hasChanges calculation:", {
			itemsSame: comparison.itemsSame,
			onlyEntsChanged: comparison.onlyEntsChanged,
			detailsSame: comparison.detailsSame,
			freeTrialsSame: comparison.freeTrialsSame,
			finalHasChanges:
				!comparison.itemsSame ||
				!comparison.detailsSame ||
				!comparison.freeTrialsSame,
		});

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
		diff,
		originalProduct: originalProductRef.current,
	};
}
