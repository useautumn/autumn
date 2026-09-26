import { Skeleton } from "@autumn/ui";
import { useState } from "react";
import { useCatalogMappings } from "@/hooks/queries/catalog/useCatalogMappings";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { SettingsGroup } from "@/views/settings/components/SettingsGroup";
import { CatalogMappingsTable } from "./CatalogMappingsTable";
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
	const { mappings, isLoading } = useCatalogMappings();
	const { products, isLoading: isLoadingProducts } = useProductsQuery();

	return (
		<>
			<SettingsGroup
				title="Product mappings"
				description="Each Autumn plan links to one Stripe product, shared by all its versions and variants."
			>
				<div className="flex flex-col gap-3">
					{mappings && !mappings.stripe_connected && (
						<div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-tertiary-foreground text-xs">
							Stripe is not connected, so saved mappings cannot be verified yet.
						</div>
					)}

					{isLoading || isLoadingProducts ? (
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

			<PlanMappingDetailSheet
				onOpenChange={(open) => !open && setSelectedPlanId(null)}
				planId={selectedPlanId}
			/>
		</>
	);
};
