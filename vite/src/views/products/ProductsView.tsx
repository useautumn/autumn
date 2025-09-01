"use client";

import LoadingScreen from "../general/LoadingScreen";
import CreateProduct from "./CreateProduct";
import CreateReward from "./rewards/CreateReward";
import CreateRewardProgramModal from "./reward-programs/CreateRewardProgram";
import CreateCreditSystem from "../credits/CreateCreditSystem";

import { useEffect, useState } from "react";
import { useAxiosSWR, usePostSWR } from "@/services/useAxiosSwr";
import { Product, Feature } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import { ProductsTable } from "./ProductsTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Gift, Flag } from "lucide-react";
import { RewardsTable } from "./rewards/RewardsTable";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";
import { FeaturesTable } from "../features/FeaturesTable";
import { CreateFeatureDialog } from "../features/CreateFeature";
import { CreditSystemsTable } from "../credits/CreditSystemsTable";
import { FeaturesContext } from "../features/FeaturesContext";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";
import { Badge } from "@/components/ui/badge";
import { useQueryState } from "nuqs";
import { useSecondaryTab } from "@/hooks/useSecondaryTab";

function ProductsView({ env }: { env: AppEnv }) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "products",
    history: "push",
  });

  useSecondaryTab({ defaultTab: "products" });

  const [showArchived, setShowArchived] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showArchivedFeatures, setShowArchivedFeatures] = useState(false);
  const [featuresDropdownOpen, setFeaturesDropdownOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data, isLoading, mutate } = usePostSWR({
    url: `/products/data`,
    data: { showArchived },
    queryKey: ["products", showArchived],
  });

  const { data: allCounts, mutate: mutateCounts } = useAxiosSWR({
    url: `/products/counts`,
    env: env,
    withAuth: true,
  });

  const {
    data: featuresData,
    isLoading: isFeaturesLoading,
    mutate: mutateFeatures,
  } = useAxiosSWR({
    url: `/features?showArchived=${showArchivedFeatures}`,
    env: env,
    withAuth: true,
  });

  useEffect(() => {
    if (data?.products.length > 0 && !selectedProduct) {
      setSelectedProduct(data.products[0]);
    }
  }, [data]);

  useEffect(() => {
    mutateFeatures();
  }, [showArchivedFeatures]);

  const creditSystems =
    featuresData?.features?.filter(
      (f: Feature) => f.type === "credit_system"
    ) || [];

  if (isLoading || isFeaturesLoading) return <LoadingScreen />;

  return (
    <ProductsContext.Provider
      value={{
        ...data,
        groupToDefault: data?.groupToDefault || {},
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
          <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Products</h1>

          <Tabs
            defaultValue="products"
            className="w-full"
            value={tab}
            onValueChange={(value) => setTab(value)}
          >
            {/* <TabsList className="text-t2 gap-8 px-8 h-fit">
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package size={12} /> Products
              </TabsTrigger>
              <TabsTrigger value="features" className="flex items-center gap-2">
                <Flag size={12} /> Features
              </TabsTrigger>
              <TabsTrigger value="rewards" className="flex items-center gap-2">
                <Gift size={12} /> Rewards
              </TabsTrigger>
            </TabsList> */}

            {(tab === "products" || !tab) && (
              <>
                <PageSectionHeader
                  title="Products"
                  titleComponent={
                    <>
                      <span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
                        {data?.products?.length}
                      </span>
                      {showArchived && (
                        <Badge className="shadow-none bg-yellow-100 border-yellow-500 text-yellow-500 hover:bg-yellow-100">
                          Archived
                        </Badge>
                      )}
                    </>
                  }
                  addButton={<CreateProduct />}
                  menuComponent={
                    <HamburgerMenu
                      dropdownOpen={dropdownOpen}
                      setDropdownOpen={setDropdownOpen}
                      actions={[
                        {
                          type: "item",
                          label: showArchived
                            ? `Show active products`
                            : `Show archived products`,
                          onClick: () => setShowArchived((prev) => !prev),
                        },
                      ]}
                    />
                  }
                />
                <ProductsTable products={data?.products} />
              </>
            )}

            {/* <TabsContent value="products" className="pt-0">
              <PageSectionHeader
                title="Products"
                titleComponent={
                  <>
                    <span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
                      {data?.products?.length}
                    </span>
                    {showArchived && (
                      <Badge className="shadow-none bg-yellow-100 border-yellow-500 text-yellow-500 hover:bg-yellow-100">
                        Archived
                      </Badge>
                    )}
                  </>
                }
                addButton={<CreateProduct />}
                menuComponent={
                  <HamburgerMenu
                    dropdownOpen={dropdownOpen}
                    setDropdownOpen={setDropdownOpen}
                    actions={[
                      {
                        type: "item",
                        label: showArchived
                          ? `Show active products`
                          : `Show archived products`,
                        onClick: () => setShowArchived((prev) => !prev),
                      },
                    ]}
                  />
                }
              />
              <ProductsTable products={data?.products} />
            </TabsContent> */}

            {tab === "features" && (
              <>
                <PageSectionHeader
                  title="Features"
                  titleComponent={
                    <>
                      <span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
                        {featuresData?.features?.length}
                      </span>
                      {showArchived && (
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
                          label: showArchivedFeatures
                            ? "Show active features"
                            : "Show archived features",
                          onClick: () =>
                            setShowArchivedFeatures(!showArchivedFeatures),
                        },
                      ]}
                    />
                  }
                />

                <div className="flex flex-col gap-16">
                  <FeaturesTable />

                  {/* Credits Section */}
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
              </>
            )}

            {tab === "rewards" && (
              <>
                <div className="flex flex-col gap-16">
                  {/* Coupons Section */}
                  <div>
                    <div className="border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm text-t2 font-medium">Coupons</h2>
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
                          {data?.rewardPrograms?.length || 0}
                        </span>
                      </div>
                      <CreateRewardProgramModal />
                    </div>
                    <div>
                      <RewardProgramsTable />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* <TabsContent value="rewards"></TabsContent> */}
          </Tabs>
        </div>
      </FeaturesContext.Provider>
    </ProductsContext.Provider>
  );
}

export default ProductsView;
