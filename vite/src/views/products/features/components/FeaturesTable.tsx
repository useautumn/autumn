import { type Feature, FeatureType } from "@autumn/shared";
import { useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import CopyButton from "@/components/general/CopyButton";
import { Item, Row } from "@/components/general/TableGrid";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useProductsQueryState } from "../../hooks/useProductsQueryState";
import { FeatureRowToolbar } from "../feature-row-toolbar/FeatureRowToolbar";
import { FeatureTypeBadge } from "./FeatureTypeBadge";
import UpdateFeatureSheet from "./UpdateFeatureSheet";

export const FeaturesTable = () => {
	const { features } = useFeaturesQuery();
	const { queryStates } = useProductsQueryState();

	const [open, setOpen] = useState(false);
	const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

	const getMeteredEventNames = (feature: Feature) => {
		if (feature.type !== FeatureType.Metered) return "";

		if (!feature.event_names || feature.event_names.length === 0) return "";

		return feature.event_names.join(", ");
	};

	const handleRowClick = (id: string) => {
		const feature = features.find((feature: Feature) => feature.id === id);
		if (!feature) return;
		setSelectedFeature(feature);
		setOpen(true);
	};

	const filteredFeatures = features.filter((feature) => {
		if (feature.type === FeatureType.CreditSystem) return false;
		return queryStates.showArchivedFeatures
			? feature.archived
			: !feature.archived;
	});

	return (
		<div>
			<UpdateFeatureSheet
				open={open}
				setOpen={setOpen}
				selectedFeature={selectedFeature}
			/>
			{features && features.length > 0 ? (
				<Row type="header" className="grid-cols-18 -mb-1 items-center">
					<Item className="col-span-4">Name</Item>
					<Item className="col-span-4 px-1">ID</Item>
					<Item className="col-span-3">Type</Item>
					<Item className="col-span-4">Event Names</Item>
					<Item className="col-span-2">Created At</Item>
					<Item className="col-span-1"></Item>
				</Row>
			) : (
				<div className="flex justify-start items-center px-10 h-10 text-t3">
					{queryStates.showArchivedFeatures
						? "You haven't archived any features yet."
						: "Define the features of your application you want to charge for."}
				</div>
			)}

			{filteredFeatures.map((feature: Feature) => (
				<Row
					key={feature.internal_id}
					// className="grid-cols-18 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap"
					onClick={() => handleRowClick(feature.id)}
				>
					<Item className="col-span-4">
						<span className="truncate">
							<AdminHover
								texts={[
									{ key: "Internal ID", value: feature.internal_id || "" },
								]}
							>
								{feature.name}
							</AdminHover>
						</span>
					</Item>
					<Item className="col-span-4 font-mono">
						<span className="truncate">
							<CopyButton
								text={feature.id}
								className="bg-transparent border-none text-t3 px-1"
							>
								{feature.id}
							</CopyButton>
						</span>
					</Item>
					<Item className="col-span-3">
						<FeatureTypeBadge {...feature} />
					</Item>
					<Item className="col-span-4">
						<span className="truncate">{getMeteredEventNames(feature)}</span>
					</Item>
					<Item className="col-span-2 text-t3 text-xs">
						{formatUnixToDateTime(feature.created_at).date}
					</Item>
					<Item className="col-span-1 items-center justify-end">
						<FeatureRowToolbar feature={feature} />
					</Item>
				</Row>
			))}
		</div>
	);
};
