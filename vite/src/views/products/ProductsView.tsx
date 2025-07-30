"use client";

import { useEffect, useState } from "react";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { Product, Feature } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import CreateProduct from "./CreateProduct";
import { ProductsTable } from "./ProductsTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Package, Gift, Flag } from "lucide-react";

import { RewardsTable } from "./rewards/RewardsTable";
import CreateReward from "./rewards/CreateReward";
import CreateRewardProgramModal from "./reward-programs/CreateRewardProgram";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";
import { FeaturesTable } from "../features/FeaturesTable";
import { CreateFeatureDialog } from "../features/CreateFeature";
import { CreditSystemsTable } from "../credits/CreditSystemsTable";
import CreateCreditSystem from "../credits/CreateCreditSystem";
import { FeaturesContext } from "../features/FeaturesContext";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";

function ProductsView({ env }: { env: AppEnv }) {
	const [tab, setTab] = useState("products");
	const [showArchived, setShowArchived] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [showArchivedFeatures, setShowArchivedFeatures] = useState(false);
	const [featuresDropdownOpen, setFeaturesDropdownOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<Product | null>(
		null
	);
	const { data, isLoading, mutate } = useAxiosPostSWR({
		url: `/products/data`,
		env: env,
		withAuth: true,
		data: {
			showArchived,
		},
		queryKey: ["products", showArchived],
	});

	const { data: allCounts, mutate: mutateCounts } = useAxiosSWR({
		url: `/products/counts`,
		env: env,
		withAuth: true,
	});

	const { data: featuresData, mutate: mutateFeatures } = useAxiosSWR({
		url: `/features?showArchived=${showArchivedFeatures}`,
		env: env,
		withAuth: true,
		// queryKey: ["features", showArchivedFeatures],
		// options: {
			// refreshInterval: 0,
		// },
	});

	useEffect(() => {
		if (data?.products.length > 0 && !selectedProduct) {
			setSelectedProduct(data.products[0]);
		}
	}, [data]);

	useEffect(() => {
		// Trigger refetch when showArchivedFeatures changes
		mutateFeatures();
		console.log("showArchivedFeatures", showArchivedFeatures, "mutated");
	}, [showArchivedFeatures]);

	const creditSystems =
		featuresData?.features?.filter(
			(f: Feature) => f.type === "credit_system"
		) || [];

	if (isLoading) return <LoadingScreen />;

	return (
		<ProductsContext.Provider
			value={{
				...data,
				env,
				selectedProduct,
				setSelectedProduct,
				mutate,
				allCounts,
				mutateCounts,
				showArchived,
				setShowArchived,
			}}
		>
			<FeaturesContext.Provider
				value={{
					features:
						featuresData?.features?.filter(
							(f: Feature) => f.type !== "credit_system"
						) || [],
					creditSystems:
						featuresData?.features?.filter(
							(f: Feature) => f.type === "credit_system"
						) || [],
					dbConns: featuresData?.dbConns || [],
					env,
					mutate: mutateFeatures,
					showArchived: showArchivedFeatures,
					setShowArchived: setShowArchivedFeatures,
					dropdownOpen: featuresDropdownOpen,
					setDropdownOpen: setFeaturesDropdownOpen,
				}}
			>
				<div className="flex flex-col gap-4 h-fit relative w-full text-sm">
					<h1 className="text-xl font-medium shrink-0 pt-6 pl-10">
						Products
					</h1>

					<Tabs
						defaultValue="products"
						className="w-full"
						value={tab}
						onValueChange={(value) => setTab(value)}
					>
						<TabsList className="text-t2 gap-8 px-8 h-fit">
							<TabsTrigger
								value="products"
								className="flex items-center gap-2"
							>
								<Package size={12} /> Products
							</TabsTrigger>
							<TabsTrigger
								value="features"
								className="flex items-center gap-2"
							>
								<Flag size={12} /> Features
							</TabsTrigger>
							<TabsTrigger
								value="rewards"
								className="flex items-center gap-2"
							>
								<Gift size={12} /> Rewards
							</TabsTrigger>
						</TabsList>

						<TabsContent value="products">
							<PageSectionHeader
								title="Products"
								titleComponent={
									<span className="text-t2 px-1 rounded-md bg-stone-200">
										{data?.products?.length}{" "}
									</span>
								}
								addButton={
									<>
										<CreateProduct />
										<HamburgerMenu
											dropdownOpen={dropdownOpen}
											setDropdownOpen={setDropdownOpen}
											actions={[
												{
													type: "item",
													label: showArchived
														? `Show non-archived product(s)`
														: `Show archived product(s)`,
													onClick: async () => {
														const newShowArchived = !showArchived;
														setShowArchived(newShowArchived);
														// Manually trigger refetch since useAxiosPostSWR doesn't auto-refetch on queryKey changes
														setTimeout(() => mutate(), 0);
													},
												},
											]}
										/>
									</>
								}
							/>
							<ProductsTable products={data?.products} />
						</TabsContent>

						<TabsContent value="features">
							<div className="sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center">
								<div className="flex items-center gap-2">
									<h2 className="text-sm text-t2 font-medium">
										Features
									</h2>
									<span className="text-t2 px-1 rounded-md bg-stone-200">
										{featuresData?.features?.length || 0}
									</span>
								</div>
								<div className="flex items-center">
									<CreateFeatureDialog />
									<HamburgerMenu
										dropdownOpen={featuresDropdownOpen}
										setDropdownOpen={setFeaturesDropdownOpen}
										actions={[
											{
												type: "item",
												label: showArchivedFeatures
													? "Show Active Features"
													: "Show Archived Features",
												onClick: () => setShowArchivedFeatures(!showArchivedFeatures),
											},
										]}
									/>
								</div>
							</div>
							<div className="flex flex-col gap-16">
								<FeaturesTable />

								{/* Credits Section */}
								<div>
									<div className="border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center whitespace-nowrap">
										<div className="flex items-center gap-2">
											<h2 className="text-sm text-t2 font-medium">
												Credits
											</h2>
											<span className="text-t2 px-1 rounded-md bg-stone-200">
												{creditSystems.length}
											</span>
										</div>
										<CreateCreditSystem />
									</div>
									<CreditSystemsTable />
								</div>
							</div>
						</TabsContent>

						<TabsContent value="rewards">
							<div className="flex flex-col gap-16">
								{/* Coupons Section */}
								<div>
									<div className="border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center whitespace-nowrap">
										<div className="flex items-center gap-2">
											<h2 className="text-sm text-t2 font-medium">
												Coupons
											</h2>
											<span className="text-t2 px-1 rounded-md bg-stone-200">
												{data?.rewards?.length || 0}
											</span>
										</div>
										<CreateReward />
									</div>
									<div className="">
										<RewardsTable />
									</div>
								</div>

								{/* Referral Programs Section */}
								<div>
									<div className=" z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center whitespace-nowrap">
										<div className="flex items-center gap-2">
											<h2 className="text-sm text-t2 font-medium">
												Referral Programs
											</h2>
											<span className="text-t2 px-1 rounded-md bg-stone-200">
												{data?.rewardPrograms?.length ||
													0}
											</span>
										</div>
										<CreateRewardProgramModal />
									</div>
									<div>
										<RewardProgramsTable />
									</div>
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</FeaturesContext.Provider>
		</ProductsContext.Provider>
	);
}

export default ProductsView;
