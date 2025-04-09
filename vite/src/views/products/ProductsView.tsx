"use client";

import { useEffect, useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { Product } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import CreateProduct from "./CreateProduct";
import { ProductsTable } from "./ProductsTable";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";

import { Ticket } from "lucide-react";
import React from "react";

import { RewardsTable } from "./rewards/RewardsTable";
import CreateReward from "./rewards/CreateReward";
import CreateRewardProgramModal from "./reward-programs/CreateRewardProgram";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";

function ProductsView({ env }: { env: AppEnv }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showRewards, setShowRewards] = useState(false);
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

  useEffect(() => {
    if (data?.products.length > 0 && !selectedProduct) {
      setSelectedProduct(data.products[0]);
    }

    if (data?.rewards.length > 0) {
      setShowRewards(true);
    }
  }, [data]);

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
      <div className="p-6 flex flex-col gap-4 max-w-[1048px]">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-medium">Products</h1>
            <p className="text-sm text-t2">
              Create the products your users can purchase.
            </p>
          </div>
          <ToggleDisplayButton
            show={showRewards}
            disabled={data?.rewards.length > 0}
            onClick={() => setShowRewards((prev) => !prev)}
          >
            <Ticket size={12} className="mr-2" />
            Coupons
          </ToggleDisplayButton>
        </div>
        <ProductsTable products={data?.products} />
        <CreateProduct />
        {showRewards && (
          <React.Fragment>
            <div className="flex flex-col gap-4 h-fit mt-6">
              <div>
                <h2 className="text-lg font-medium">Coupons</h2>
                <p className="text-sm text-t2">
                  Create a coupon to give users credits or a discount on one or
                  more products.{" "}
                  {/* <span className="text-t3">(eg, 10% off all products).</span> */}
                </p>
              </div>
              <RewardsTable />
              <CreateReward />
            </div>
            <div className="flex flex-col gap-4 h-fit mt-6">
              <div>
                <h2 className="text-lg font-medium">Referral Programs</h2>
                <p className="text-sm text-t2">Create a referral program. </p>
              </div>
              <RewardProgramsTable />
              <CreateRewardProgramModal />
            </div>
          </React.Fragment>
        )}
      </div>
    </ProductsContext.Provider>
  );
}

export default ProductsView;
