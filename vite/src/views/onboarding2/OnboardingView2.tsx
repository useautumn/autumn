import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ProductsContext } from "../products/ProductsContext";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import CreateProduct from "../products/CreateProduct";
import { ProductV2 } from "@autumn/shared";
import { ProductsTable } from "../products/ProductsTable";
import LoadingScreen from "../general/LoadingScreen";
import { EditProductDialog } from "../onboarding/onboarding-steps/ProductList";
import { AutumnProvider } from "autumn-js/react";
import PricingTable from "@/components/autumn/pricing-table";
import Install from "./Install";
import EnvStep from "./Env";
import MountHandler from "./MountHandler";
import AutumnProviderStep from "./AutumnProvider";
import AttachProduct from "./AttachProduct";
import SmallSpinner from "@/components/general/SmallSpinner";
import { CustomersTable } from "../customers/CustomersTable";
import { CustomersContext } from "../customers/CustomersContext";
import { ModelPricing } from "./model-pricing/ModelPricing";
import { useListProducts } from "./model-pricing/usePricingTable";
import { parseAsString, useQueryStates } from "nuqs";
import IntegrateAutumn from "./integrate/IntegrateAutumn";

export default function OnboardingView2() {
  const [queryStates, setQueryStates] = useQueryStates({
    page: parseAsString.withDefault("integrate"),
  });

  const {
    products: autumnProducts,
    isLoading: isAutumnLoading,
    error,
    mutate: mutateAutumnProducts,
  } = useListProducts();

  const { data, mutate, isLoading } = useAxiosSWR({ url: `/products/data` });
  const { data: productCounts } = useAxiosSWR({ url: `/products/counts` });

  if (isLoading || isAutumnLoading) return <LoadingScreen />;

  return (
    <AutumnProvider
      backendUrl={`${import.meta.env.VITE_BACKEND_URL}/demo`}
      includeCredentials={true}
    >
      {queryStates.page === "integrate" ? (
        <IntegrateAutumn />
      ) : (
        // <div className="w-full h-full p-10 flex flex-col items-center justify-start">
        //   <div className="max-w-[800px] w-full">
        //     <div className="flex flex-col gap-2">
        //       <p className="text-xl">Integrate Autumn</p>
        //       <p className="text-t3">
        //         Let's integrate Autumn and get your first customer onto one of
        //         your plans
        //       </p>
        //     </div>
        //   </div>
        // </div>
        <ModelPricing
          data={data}
          mutate={async () => {
            await mutate();
            await mutateAutumnProducts();
          }}
          autumnProducts={autumnProducts}
          productCounts={productCounts}
        />
      )}
      {/* <div className="w-full h-full p-10 flex flex-col">
        <div className="flex flex-col max-w-[800px] gap-10  pb-[200px]">
          <div className="flex flex-col gap-6">
            <p className="text-xl font-bold">Integrate Autumn</p>
            <p className="text-t3">
              Let's integrate Autumn and get your first customer onto one of
              your plans
            </p>
            <div className="flex flex-col gap-4">
              <StepHeader number={1} title="Install autumn-js" />
              <Install />
            </div>
            <div className="flex flex-col gap-4">
              <StepHeader number={2} title="Add your secret key" />
              <p className="text-md text-t3">
                Create a .env file in the root of your project and add the
                following environment variables:
              </p>
              <EnvStep />
            </div>

            <MountHandler number={3} />
            <AutumnProviderStep number={4} />

            <p>
              If you've made it to this point, you should see a customer (with
              the customerId you returned in autumnHandler) here!
            </p>
            <div className="flex flex-col gap-4">
              <PageSectionHeader
                isOnboarding={true}
                title="Customers"
                className="pr-0 border-l"
                endContent={
                  <div className="flex items-center gap-2 text-t3 text-sm pr-4">
                    <SmallSpinner />
                    <p>Watching for customers...</p>
                  </div>
                }
              />
              <CustomersContext.Provider
                value={{
                  customers: data?.customers,
                  env,
                  mutate: customersMutate,
                  products: data?.products,
                  versionCounts: data?.versionCounts,
                }}
              >
                <CustomersTable customers={customersData?.customers || []} />
              </CustomersContext.Provider>
            </div>
          </div>
        </div>
      </div> */}
    </AutumnProvider>
  );
}

const StepHeader = ({ number, title }: { number: number; title: string }) => {
  return (
    <div className="flex items-center gap-4">
      <div className="w-6 h-6 border-1 rounded-full bg-gradient-to-b from-stone-100 to-stone-100 text-primary font-bold flex items-center justify-center">
        {number}
      </div>
      <p className="text-md">{title}</p>
    </div>
  );
};

const SamplePricingTable = () => {
  return <PricingTable />;
};
