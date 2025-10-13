import { FeatureType } from "@autumn/shared";
import { useEffect, useState } from "react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";
import { Badge } from "@/components/ui/badge";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import CreateFeatureSheet from "@/views/products/features/components/CreateFeatureSheet";
import { FeaturesTable } from "@/views/products/features/components/FeaturesTable";
import { CreateCreditSystemSheet } from "@/views/products/features/credit-systems/components/CreateCreditSystemSheet";
import { useProductsQueryState } from "../hooks/useProductsQueryState";
import { CreditSystemsTable } from "./credit-systems/CreditSystemsTable";

export const FeaturesPage = () => {
	const { features } = useFeaturesQuery();
	const { queryStates, setQueryStates } = useProductsQueryState();
	const [featuresDropdownOpen, setFeaturesDropdownOpen] = useState(false);
	const [createFeatureSheetOpen, setCreateFeatureSheetOpen] = useState(false);

	// Add keyboard shortcut: N to open create feature sheet
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.key === "n" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				const target = e.target as HTMLElement;
				if (
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable
				) {
					return;
				}
				e.preventDefault();
				setCreateFeatureSheetOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
				addButton={
					<CreateFeatureSheet
						open={createFeatureSheetOpen}
						onOpenChange={setCreateFeatureSheetOpen}
					/>
				}
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
						<CreateCreditSystemSheet />
					</div>
					<CreditSystemsTable />
				</div>
			</div>
		</div>
	);
};
