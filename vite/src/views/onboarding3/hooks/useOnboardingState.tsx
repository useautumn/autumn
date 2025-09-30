import { AppEnv, type ProductItem, type ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";

export const useOnboardingState = () => {
	// Base product state (managed by usePlanData in OnboardingContent)
	const [baseProduct, setBaseProduct] = useState<ProductV2>({
		id: "",
		name: "",
		items: [] as ProductItem[],
		archived: false,
		created_at: Date.now(),
		is_add_on: false,
		is_default: false,
		version: 1,
		group: "",
		env: AppEnv.Sandbox,
		internal_id: "",
	});

	// Feature creation state
	const [feature, setFeature] = useState(() => getDefaultFeature());
	const [createdFeatureItem, setCreatedFeatureItem] =
		useState<ProductItem | null>(null);

	return {
		// Base product state (for usePlanData)
		baseProduct,
		setBaseProduct,

		// Feature state
		feature,
		setFeature,
		createdFeatureItem,
		setCreatedFeatureItem,
	};
};
