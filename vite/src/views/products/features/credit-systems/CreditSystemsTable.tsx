import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { CreateFeature, Feature, FeatureType } from "@autumn/shared";
import { useState } from "react";
// import { CreditSystemRowToolbar } from "./CreditSystemRowToolbar";
// import UpdateCreditSystem from "./UpdateCreditSystem";
import { Item, Row } from "@/components/general/TableGrid";
import { AdminHover } from "@/components/general/AdminHover";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import UpdateCreditSystem from "./UpdateCreditSystem";
import { FeatureRowToolbar } from "../feature-row-toolbar/FeatureRowToolbar";
import { useProductsQueryState } from "../../hooks/useProductsQueryState";

export const CreditSystemsTable = () => {
	const { features } = useFeaturesQuery();
	const [selectedCreditSystem, setSelectedCreditSystem] =
		useState<CreateFeature | null>(null);
	const [open, setOpen] = useState(false);

	const { queryStates } = useProductsQueryState();

	const creditSystems = features.filter((feature) => {
		if (queryStates.showArchivedFeatures)
			return feature.type === FeatureType.CreditSystem && feature.archived;

		return feature.type === FeatureType.CreditSystem && !feature.archived;
	});

	console.log("Credit Systems", creditSystems);

	const handleRowClick = (id: string) => {
		const creditSystem = creditSystems.find(
			(creditSystem: Feature) => creditSystem.id === id,
		);
		if (!creditSystem) return;
		setSelectedCreditSystem(creditSystem);
		setOpen(true);
	};

	return (
		<>
			<UpdateCreditSystem
				open={open}
				setOpen={setOpen}
				selectedCreditSystem={selectedCreditSystem!}
				setSelectedCreditSystem={setSelectedCreditSystem}
			/>

			{creditSystems && creditSystems.length > 0 ? (
				<Row type="header" className="grid-cols-18 -mb-1">
					<Item className="col-span-4">Credits Name</Item>
					<Item className="col-span-4">Credits ID</Item>
					<Item className="col-span-7">Features</Item>
					<Item className="col-span-2">Created At</Item>
					<Item className="col-span-1"></Item>
				</Row>
			) : (
				<div className="flex justify-start items-center h-10 px-10 text-t3">
					Create a credit system to manage usage across multiple features.
				</div>
			)}

			{creditSystems.map((creditSystem: Feature) => (
				<Row
					key={creditSystem.id}
					// className="grid-cols-18 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap"
					onClick={() => handleRowClick(creditSystem.id)}
				>
					<Item className="col-span-4">
						<span className="truncate font-medium">
							<AdminHover
								texts={[
									{ key: "Internal ID", value: creditSystem.internal_id || "" },
								]}
							>
								{creditSystem.name}
							</AdminHover>
						</span>
					</Item>
					<Item className="col-span-4">
						<span className="truncate font-mono">{creditSystem.id}</span>
					</Item>
					<Item className="col-span-7">
						<span className="truncate font-mono">
							{creditSystem.config.schema
								.map((schema: any) => schema.metered_feature_id)
								.join(", ")}
						</span>
					</Item>
					<Item className="col-span-2 text-t3 text-xs">
						{formatUnixToDateTime(creditSystem.created_at).date}
					</Item>
					<Item className="col-span-1 items-center justify-end">
						{/* <CreditSystemRowToolbar creditSystem={creditSystem} /> */}
						<FeatureRowToolbar feature={creditSystem} />
					</Item>
				</Row>
			))}
		</>
	);
};
