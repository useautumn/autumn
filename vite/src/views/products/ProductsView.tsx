"use client";

import { useEffect, useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { Product } from "@autumn/shared";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import CreateProduct from "./CreateProduct";
import { ProductsTable } from "./ProductsTable";
import { CouponsTable } from "./coupons/CouponsTable";
import CreateCoupon from "./coupons/CreateCoupon";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";

import { Ticket } from "lucide-react";
import React from "react";
import CreateRewardTrigger from "./reward-triggers/CreateRewardTriger";
import { RewardTriggersTable } from "./reward-triggers/RewardTriggersTable";
import CreateRewardTriggerModal from "./reward-triggers/CreateRewardTriger";

function ProductsView({ env }: { env: AppEnv }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCoupons, setShowCoupons] = useState(false);
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

    if (data?.coupons.length > 0) {
      setShowCoupons(true);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-medium">Products</h1>
          <p className="text-sm text-t2">
            Create the products your users can purchase.
          </p>
        </div>
        <ToggleDisplayButton
          show={showCoupons}
          disabled={data?.coupons.length > 0}
          onClick={() => setShowCoupons((prev) => !prev)}
        >
          <Ticket size={12} className="mr-2" />
          Coupons
        </ToggleDisplayButton>
      </div>
      <ProductsTable products={data?.products} />
      <CreateProduct />
      {showCoupons && (
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
            <CouponsTable />
            <CreateCoupon />
          </div>
          <div className="flex flex-col gap-4 h-fit mt-6">
            <div>
              <h2 className="text-lg font-medium">Referrals</h2>
              <p className="text-sm text-t2">Create a referral program. </p>
            </div>
            <RewardTriggersTable />
            <CreateRewardTriggerModal />
          </div>
        </React.Fragment>
      )}
    </ProductsContext.Provider>
  );
}

export default ProductsView;
