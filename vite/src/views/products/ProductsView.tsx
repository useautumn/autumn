"use client";

import type { AppEnv } from "@autumn/shared";
import { useEffect } from "react";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetCleanup } from "@/hooks/stores/useSheetStore";
import LoadingScreen from "../general/LoadingScreen";
import { OnboardingGuide } from "../onboarding4/OnboardingGuide";
import { FeaturesPage } from "./features/FeaturesPage";
import { ProductsContext } from "./ProductsContext";
import { ProductsPage } from "./products/ProductsPage";
import { RewardsPage } from "./rewards/RewardsPage";

function ProductsView({ env: _env }: { env: AppEnv }) {
	const { queryStates } = useAppQueryStates({
		defaultTab: "products",
	});

	useSheetCleanup();
	const resetProductStore = useProductStore((s) => s.reset);

	// reset product store when the view mounts
	useEffect(() => {
		resetProductStore();
	}, [resetProductStore]);

	const { isLoading: isProductsLoading } = useProductsQuery();
	const { isLoading: isFeaturesLoading } = useFeaturesQuery();
	const { isLoading: isRewardsLoading } = useRewardsQuery();

	if (isProductsLoading || isFeaturesLoading || isRewardsLoading)
		return <LoadingScreen />;

	const tab = queryStates.tab;
	return (
		<ProductsContext.Provider value={{}}>
			<div className="flex flex-col gap-4 h-fit relative w-full pb-8 max-w-5xl mx-auto pt-4 sm:pt-8">
				{/* Onboarding Guide - visible on all tabs */}
				<div className="px-4 sm:px-10">
					<OnboardingGuide />
				</div>

				{tab === "products" && <ProductsPage />}
				{tab === "features" && <FeaturesPage />}
				{tab === "rewards" && <RewardsPage />}
			</div>
		</ProductsContext.Provider>
	);
}

export default ProductsView;
