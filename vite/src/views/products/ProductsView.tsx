"use client";

import { useEffect, useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { Product, Feature } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import CreateProduct from "./CreateProduct";
import { ProductsTable } from "./ProductsTable";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Ticket, Package, Gift, Flag, Banknote } from "lucide-react";
import React from "react";

import { RewardsTable } from "./rewards/RewardsTable";
import CreateReward from "./rewards/CreateReward";
import CreateRewardProgramModal from "./reward-programs/CreateRewardProgram";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";
import { FeaturesTable } from "../features/FeaturesTable";
import { CreateFeatureDialog } from "../features/CreateFeature";
import { CreditSystemsTable } from "../credits/CreditSystemsTable";
import CreateCreditSystem from "../credits/CreateCreditSystem";
import { FeaturesContext } from "../features/FeaturesContext";

function ProductsView({ env }: { env: AppEnv }) {
  const [tab, setTab] = useState("products");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  const { data: allCounts, mutate: mutateCounts } = useAxiosSWR({
    url: `/products/counts`,
    env: env,
    withAuth: true,
  });

  const { data: featuresData, mutate: mutateFeatures } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
  });

  useEffect(() => {
    if (data?.products.length > 0 && !selectedProduct) {
      setSelectedProduct(data.products[0]);
    }
  }, [data]);

  const creditSystems =
    featuresData?.features?.filter(
      (f: Feature) => f.type === "credit_system",
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
      }}
    >
      <FeaturesContext.Provider
        value={{
          features:
            featuresData?.features?.filter(
              (f: Feature) => f.type !== "credit_system",
            ) || [],
          creditSystems:
            featuresData?.features?.filter(
              (f: Feature) => f.type === "credit_system",
            ) || [],
          dbConns: featuresData?.dbConns || [],
          env,
          mutate: mutateFeatures,
        }}
      >
        <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
          <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Products</h1>

          <Tabs
            defaultValue="products"
            className="w-full"
            onValueChange={(value) => setTab(value)}
          >
            <TabsList className="text-t2 gap-8 px-8 h-fit">
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package size={12} /> Products
              </TabsTrigger>
              <TabsTrigger value="features" className="flex items-center gap-2">
                <Flag size={12} /> Features
              </TabsTrigger>
              <TabsTrigger value="rewards" className="flex items-center gap-2">
                <Gift size={12} /> Rewards
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <div className="sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm text-t2 font-medium col-span-2 flex">
                    Products
                  </h2>
                  <span className="text-t2 px-1 rounded-md bg-stone-200">
                    {data?.products?.length}{" "}
                  </span>
                </div>
                <CreateProduct />
              </div>
              <ProductsTable products={data?.products} />
            </TabsContent>

            <TabsContent value="features">
              <div className="sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm text-t2 font-medium">Features</h2>
                  <span className="text-t2 px-1 rounded-md bg-stone-200">
                    {featuresData?.features?.length || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CreateFeatureDialog />
                </div>
              </div>
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
            </TabsContent>

            <TabsContent value="rewards">
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
            </TabsContent>
          </Tabs>
        </div>
      </FeaturesContext.Provider>
    </ProductsContext.Provider>
  );
}

export default ProductsView;
