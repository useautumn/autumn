import { AppEnv, type Feature, FeatureType } from "@autumn/shared";
import { ArrowSquareOutIcon, CoinsIcon, LegoIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useEnv } from "@/utils/envUtils";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import UpdateFeatureSheet from "../components/UpdateFeatureSheet";
import UpdateCreditSystemSheet from "../credit-systems/components/UpdateCreditSystemSheet";
import { createCreditListColumns } from "./CreditListColumns";
import { CreditListCreateButton } from "./CreditListCreateButton";
import { createFeatureListColumns } from "./FeatureListColumns";
import { FeatureListCreateButton } from "./FeatureListCreateButton";
import { FeatureListMenuButton } from "./FeatureListMenuButton";

export function FeatureListTable() {
	const env = useEnv();
	const { features } = useFeaturesQuery();
	const { queryStates } = useProductsQueryState();
	const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
	const [updateFeatureOpen, setUpdateFeatureOpen] = useState(false);
	const [selectedCreditSystem, setSelectedCreditSystem] =
		useState<Feature | null>(null);
	const [updateCreditOpen, setUpdateCreditOpen] = useState(false);

	// Filter features and credit systems based on archived state
	const { regularFeatures, creditSystems, hasEventNames } = useMemo(() => {
		const regularFeatures = features?.filter((feature) => {
			if (feature.type === FeatureType.CreditSystem) return false;
			return queryStates.showArchivedFeatures
				? feature.archived
				: !feature.archived;
		});

		const creditSystems = features?.filter((feature) => {
			if (feature.type !== FeatureType.CreditSystem) return false;
			return queryStates.showArchivedFeatures
				? feature.archived
				: !feature.archived;
		});
		// Check if any feature has event names
		const hasEventNames = regularFeatures?.some(
			(feature) => feature.event_names && feature.event_names.length > 0,
		);

		return { regularFeatures, creditSystems, hasEventNames };
	}, [features, queryStates.showArchivedFeatures]);

	const featureColumns = useMemo(
		() => createFeatureListColumns({ showEventNames: hasEventNames }),
		[hasEventNames],
	);
	const creditColumns = useMemo(() => createCreditListColumns(), []);

	const featureTable = useProductTable({
		data: regularFeatures || [],
		columns: featureColumns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const creditTable = useProductTable({
		data: creditSystems || [],
		columns: creditColumns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const handleFeatureRowClick = (feature: Feature) => {
		setSelectedFeature(feature);
		setUpdateFeatureOpen(true);
	};

	const handleCreditRowClick = (creditSystem: Feature) => {
		setSelectedCreditSystem(creditSystem);
		setUpdateCreditOpen(true);
	};

	const enableSorting = false;

	const hasFeatureRows =
		featureTable.getRowModel().rows.length > 0 ||
		creditTable.getRowModel().rows.length > 0;

	// For archived view, always show table structure even if empty
	// For non-archived view, show EmptyState when no features exist
	const showTableStructure = queryStates.showArchivedFeatures || hasFeatureRows;

	const creditEmptyStateChildren = queryStates.showArchivedFeatures ? (
		"You haven't archived any credit systems yet."
	) : (
		<>
			Credit systems let you assign different credit costs to features, and draw
			usage from a common balance
			{env === AppEnv.Sandbox && (
				<IconButton
					variant="muted"
					size="sm"
					iconOrientation="right"
					icon={<ArrowSquareOutIcon size={16} className="-translate-y-px" />}
					className="px-1! ml-2"
					onClick={() =>
						window.open(
							"https://docs.useautumn.com/documentation/pricing/credits",
							"_blank",
						)
					}
				>
					Docs
				</IconButton>
			)}
		</>
	);

	return (
		<>
			<UpdateFeatureSheet
				open={updateFeatureOpen}
				setOpen={setUpdateFeatureOpen}
				selectedFeature={selectedFeature}
			/>
			<UpdateCreditSystemSheet
				open={updateCreditOpen}
				setOpen={setUpdateCreditOpen}
				selectedCreditSystem={selectedCreditSystem}
			/>

			<div className="flex flex-col gap-8">
				{/* Features Table */}
				{showTableStructure ? (
					<div>
						<Table.Provider
							config={{
								table: featureTable,
								numberOfColumns: featureColumns.length,
								enableSorting,
								isLoading: false,
								onRowClick: handleFeatureRowClick,
								emptyStateText: "You haven't archived any features yet.",
								rowClassName: "h-10",
							}}
						>
							<Table.Toolbar>
								<div className="flex w-full justify-between items-center">
									<Table.Heading>
										<LegoIcon size={16} weight="fill" className="text-subtle" />
										Features
									</Table.Heading>
									<Table.Actions>
										<div className="flex w-full justify-between items-center">
											<div className="flex items-center gap-2">
												{/* Add search and other filters here in the future if needed */}
											</div>
											<div className="flex items-center gap-2">
												<FeatureListCreateButton />
												<FeatureListMenuButton />
											</div>
										</div>
									</Table.Actions>
								</div>
							</Table.Toolbar>
							<div>
								<Table.Container>
									<Table.Content>
										<Table.Header />
										<Table.Body />
									</Table.Content>
								</Table.Container>
							</div>
						</Table.Provider>
					</div>
				) : (
					<EmptyState
						type="features"
						actionButton={<FeatureListCreateButton />}
					/>
				)}

				{/* Credits Table - Only shown if there's at least one feature */}
				{hasFeatureRows && (
					<div>
						<Table.Provider
							config={{
								table: creditTable,
								numberOfColumns: creditColumns.length,
								enableSorting,
								isLoading: false,
								onRowClick: handleCreditRowClick,
								emptyStateChildren: creditEmptyStateChildren,
								rowClassName: "h-10",
							}}
						>
							<Table.Toolbar>
								<div className="flex w-full justify-between items-center">
									<Table.Heading>
										<CoinsIcon
											size={16}
											weight="fill"
											className="text-subtle"
										/>
										Credit Systems
									</Table.Heading>
									<Table.Actions>
										<div className="flex w-full justify-between items-center">
											<div className="flex items-center gap-2">
												{/* Add search and other filters here in the future if needed */}
											</div>
											<div className="flex items-center gap-2">
												<CreditListCreateButton />
											</div>
										</div>
									</Table.Actions>
								</div>
							</Table.Toolbar>
							<div>
								<Table.Container>
									<Table.Content>
										<Table.Header />
										<Table.Body />
									</Table.Content>
								</Table.Container>
							</div>
						</Table.Provider>
					</div>
				)}
			</div>
		</>
	);
}
