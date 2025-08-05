import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { AutumnProvider } from "autumn-js/react";
import PricingTable from "@/components/autumn/pricing-table";
import { ModelPricing } from "./model-pricing/ModelPricing";
import { useListProducts } from "./model-pricing/usePricingTable";
import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";
import IntegrateAutumn from "./integrate/IntegrateAutumn";
import { useEffect, useRef, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useSearchParams } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { useSession } from "@/lib/auth-client";

export default function OnboardingView2() {
  const [queryStates, setQueryStates] = useQueryStates({
    page: parseAsString.withDefault("pricing"),
    reactTypescript: parseAsBoolean.withDefault(true),
    frontend: parseAsString.withDefault(""),
    backend: parseAsString.withDefault(""),
    auth: parseAsString.withDefault(""),
    customerType: parseAsString.withDefault("user"),
    productId: parseAsString.withDefault(""),
  });

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);
  const axiosInstance = useAxiosInstance();
  const hasHandledToken = useRef(false);
  const { data } = useSession();
  const orgId = data?.session?.activeOrganizationId;

  const {
    products: autumnProducts,
    isLoading: isAutumnLoading,
    mutate: mutateAutumnProducts,
  } = useListProducts({ customerId: "onboarding_demo_user" });

  const {
    data: productsData,
    mutate: productMutate,
    isLoading,
  } = useAxiosSWR({ url: `/products/data` });

  const { data: productCounts, mutate: mutateCounts } = useAxiosSWR({
    url: `/products/counts?latest_version=true`,
  });

  useEffect(() => {
    const handleToken = async () => {
      try {
        await axiosInstance.post("/onboarding", {
          token,
        });

        await productMutate();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (token && !hasHandledToken.current) {
      hasHandledToken.current = true;
      handleToken();
    }
  }, [searchParams, token, axiosInstance, productMutate]);

  useEffect(() => {
    if (orgId && !token) {
      setLoading(false);
    }
  }, [orgId, token]);

  if (isLoading || isAutumnLoading || loading) return <LoadingScreen />;

  return (
    <>
      {queryStates.page === "integrate" ? (
        <IntegrateAutumn
          data={productsData}
          mutate={productMutate}
          queryStates={queryStates}
          setQueryStates={setQueryStates}
        />
      ) : (
        <ModelPricing
          data={productsData}
          mutate={async () => {
            await productMutate();
            await mutateAutumnProducts();
          }}
          mutateAutumnProducts={mutateAutumnProducts}
          autumnProducts={autumnProducts}
          productCounts={productCounts}
          mutateCounts={mutateCounts}
          queryStates={queryStates}
          setQueryStates={setQueryStates}
        />
      )}
    </>
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

// const SamplePricingTable = () => {
//   return <PricingTable />;
// };
