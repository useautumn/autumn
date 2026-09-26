import { Skeleton } from "@autumn/ui";
import { useState } from "react";
import { useCatalogMappings } from "@/hooks/queries/catalog/useCatalogMappings";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { SettingsGroup } from "@/views/settings/components/SettingsGroup";
import { CatalogMappingsTable } from "./CatalogMappingsTable";
import { FeatureMappingDetailSheet } from "./FeatureMappingDetailSheet";
import { FeatureMappingsTable } from "./FeatureMappingsTable";
import { PlanMappingDetailSheet } from "./PlanMappingDetailSheet";

const CatalogMappingsTableSkeleton = () => (
	<div className="flex flex-col gap-2">
		{Array.from({ length: 4 }).map((_, index) => (
			<Skeleton className="h-11 w-full" key={index} />
		))}
	</div>
);

export const CatalogMappingsCard = () => {
	const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
	const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
		null,
	);
	const { mappings, isLoading } = useCatalogMappings();
	const { products, isLoading: isLoadingProducts } = useProductsQuery();
	const { products: allVersions, isLoading: isLoadingVersions } =
		useProductsQuery({ allVersions: true });
	const { features, isLoading: isLoadingFeatures } = useFeaturesQuery();
	const isLoadingPlans = isLoading || isLoadingProducts;
	const isLoadingFeatureRows =
		isLoading || isLoadingProducts || isLoadingVersions || isLoadingFeatures;

	return (
		<>
			<SettingsGroup
				title="Plans"
				description="Each plan's base price bills under this Stripe product. Variants share it unless you give them their own."
			>
				<div className="flex flex-col gap-3">
					{mappings && !mappings.stripe_connected && (
						<div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-tertiary-foreground text-xs">
							Stripe is not connected, so saved mappings cannot be verified yet.
						</div>
					)}

					{isLoadingPlans ? (
						<CatalogMappingsTableSkeleton />
					) : (
						mappings && (
							<CatalogMappingsTable
								mappings={mappings}
								onSelectPlan={setSelectedPlanId}
								products={products}
							/>
						)
					)}
				</div>
			</SettingsGroup>

			<SettingsGroup
				title="Features"
				description="Usage and prepaid prices bill under one Stripe product per feature, shared across every plan."
			>
				{isLoadingFeatureRows ? (
					<CatalogMappingsTableSkeleton />
				) : (
					mappings && (
						<FeatureMappingsTable
							allVersions={allVersions}
							features={features}
							latestProducts={products}
							onSelectFeature={setSelectedFeatureId}
							stripeConnected={mappings.stripe_connected}
						/>
					)
				)}
			</SettingsGroup>

			<PlanMappingDetailSheet
				onOpenChange={(open) => !open && setSelectedPlanId(null)}
				planId={selectedPlanId}
			/>
			<FeatureMappingDetailSheet
				featureId={selectedFeatureId}
				onOpenChange={(open) => !open && setSelectedFeatureId(null)}
			/>
		</>
	);
};
