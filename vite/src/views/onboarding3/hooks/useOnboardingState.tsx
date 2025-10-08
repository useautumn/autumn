import {
	AppEnv,
	BillingInterval,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { useRef, useState } from "react";
import { getDefaultFeature } from "@/views/products/features/utils/defaultFeature";

export const useOnboardingState = () => {
	// Base product state (managed by usePlanData in OnboardingContent)
	const [baseProduct, setBaseProduct] = useState<ProductV2>({
		id: "",
		name: "",
		items: [
			{
				price: "",
				interval: BillingInterval.Month,
				isBasePrice: true,
			},
		] as ProductItem[],
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

	// Track whether product/feature have been created and their latest IDs
	const productCreatedRef = useRef<{
		created: boolean;
		latestId: string | null;
	}>({
		created: false,
		latestId: null,
	});
	const featureCreatedRef = useRef<{
		created: boolean;
		latestId: string | null;
	}>({
		created: false,
		latestId: null,
	});

	// Loading state for onboarding steps
	const [isLoading, setIsLoading] = useState(false);

	return {
		// Base product state (for usePlanData)
		baseProduct,
		setBaseProduct,

		// Feature state
		feature,
		setFeature,

		// Creation tracking refs
		productCreatedRef,
		featureCreatedRef,

		// Loading state
		isLoading,
		setIsLoading,
	};
};
