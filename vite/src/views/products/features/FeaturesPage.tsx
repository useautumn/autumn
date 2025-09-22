import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Badge } from "@/components/ui/badge";
import { useProductsQueryState } from "../hooks/useProductsQueryState";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureType } from "@autumn/shared";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";
import { useState } from "react";
import { FeaturesTable } from "@/views/products/features/components/FeaturesTable";
import { CreateFeatureDialog } from "@/views/products/features/components/CreateFeature";
import CreateCreditSystem from "@/views/products/features/credit-systems/CreateCreditSystem";
import { CreditSystemsTable } from "./credit-systems/CreditSystemsTable";

export const FeaturesPage = () => {
	const { features } = useFeaturesQuery();
	const { queryStates, setQueryStates } = useProductsQueryState();
	const [featuresDropdownOpen, setFeaturesDropdownOpen] = useState(false);

	const regularFeatures = features.filter((feature) => {
		if (queryStates.showArchivedFeatures)
			return feature.type !== FeatureType.CreditSystem && feature.archived;
		return feature.type !== FeatureType.CreditSystem && !feature.archived;
	});

	const creditSystems = features.filter((feature) => {
		if (queryStates.showArchivedFeatures)
			return feature.type === FeatureType.CreditSystem && feature.archived;
		return feature.type === FeatureType.CreditSystem && !feature.archived;
	});

	return (
		<div>
			<PageSectionHeader
				title="Features"
				titleComponent={
					<>
						<span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
							{regularFeatures?.length}
						</span>
						{queryStates.showArchivedFeatures && (
							<Badge className="shadow-none bg-yellow-100 border-yellow-500 text-yellow-500 hover:bg-yellow-100">
								Archived
							</Badge>
						)}
					</>
				}
				addButton={<CreateFeatureDialog />}
				menuComponent={
					<HamburgerMenu
						dropdownOpen={featuresDropdownOpen}
						setDropdownOpen={setFeaturesDropdownOpen}
						actions={[
							{
								type: "item",
								label: queryStates.showArchivedFeatures
									? "Show active features"
									: "Show archived features",
								onClick: () =>
									setQueryStates({
										...queryStates,
										showArchivedFeatures: !queryStates.showArchivedFeatures,
									}),
							},
						]}
					/>
				}
			/>

			<div className="flex flex-col gap-16">
				<FeaturesTable />

				<div>
					<div className="border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center whitespace-nowrap">
						<div className="flex items-center gap-2">
							<h2 className="text-sm text-t2 font-medium">Credits</h2>
							<span className="text-t2 px-1 rounded-md bg-stone-200">
								{creditSystems.length}
							</span>
						</div>
						<CreateCreditSystem />
					</div>
					<CreditSystemsTable />
				</div>
			</div>
		</div>
	);
};
