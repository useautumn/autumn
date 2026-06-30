import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Skeleton,
} from "@autumn/ui";
import { useState } from "react";
import { useCatalogMappings } from "@/hooks/queries/catalog/useCatalogMappings";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
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
			<Card className="bg-interactive-secondary shadow-none">
				<CardHeader>
					<CardTitle className="text-base">Stripe product mappings</CardTitle>
					<CardDescription>
						Link Autumn plans and their items to Stripe products for base-price
						sync. Select a plan to edit its mappings.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 pt-0">
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
				</CardContent>
			</Card>

			<PlanMappingDetailSheet
				onOpenChange={(open) => !open && setSelectedPlanId(null)}
				planId={selectedPlanId}
			/>
		</>
	);
};
