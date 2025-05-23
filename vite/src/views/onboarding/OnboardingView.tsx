"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { useSearchParams } from "react-router";
import Step from "@/components/general/OnboardingStep";
import { AppEnv } from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { Book } from "lucide-react";
import { CreateOrgStep } from "./onboarding-steps/01_CreateOrg";
import { ConnectStripeStep } from "./onboarding-steps/02_ConnectStripe";
import { CreateProductStep } from "./onboarding-steps/03_CreateProduct";
import { CreateSecretKey } from "./onboarding-steps/04_CreateSecretKey";
import AttachProduct from "./onboarding-steps/04_AttachProduct";
import CheckAccessStep from "./onboarding-steps/05_CheckAccess";
import Install from "./onboarding-steps/Install";
import LoadingScreen from "../general/LoadingScreen";
import { ProductList } from "./onboarding-steps/03_ProductList";
import { useCreateOrg } from "./hooks/useCreateOrg";

function OnboardingView() {
  const env = useEnv();

  const { organization: org } = useOrganization();
  const { setActive } = useOrganizationList();

  const [searchParams] = useSearchParams();
  const [orgCreated, setOrgCreated] = useState(org ? true : false);

  const [apiKey, setApiKey] = useState("");
  const [productId, setProductId] = useState("");

  const hasHandledOrg = useRef(false);
  const hasHandledToken = useRef(false);
  const axiosInstance = useAxiosInstance();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(true);

  const {
    data: productData,
    mutate: productMutate,
    isLoading: productLoading,
  } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  useEffect(() => {
    const handleToken = async () => {
      try {
        const { data } = await axiosInstance.post("/onboarding", {
          token,
        });

        await productMutate();
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (org && token && !hasHandledToken.current) {
      hasHandledToken.current = true;
      handleToken();
    }
  }, [org, searchParams, token, axiosInstance, productMutate]);

  useEffect(() => {
    if (org && !token) {
      setLoading(false);
    }
  }, [org, token]);

  useCreateOrg({ productMutate });

  if (loading || productLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="text-sm w-full flex justify-start">
      <div className="flex flex-col p-8 px-14">
        {productData && (
          <>
            <ProductList data={productData} mutate={productMutate} />
            <CreateSecretKey apiKey={apiKey} setApiKey={setApiKey} number={2} />
            <ConnectStripeStep
              mutate={productMutate}
              productData={productData}
              number={3}
            />

            <Install number={4} />

            <AttachProduct productId={productId} apiKey={apiKey} number={5} />

            <CheckAccessStep apiKey={apiKey} number={6} />

            <Step
              title="Done!"
              number={7}
              description={
                <p>
                  You&apos;re all set! Autumn is tracking your customers' usage,
                  what they have access to and how much they should be billed.{" "}
                  <br /> <br /> Go to the Customers tab to manage your users,
                  and read our{" "}
                  <a
                    className="text-primary underline font-semibold break-none"
                    href="https://docs.useautumn.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                    <Book size={12} className="inline ml-1" />
                  </a>{" "}
                  to learn more about what you can do with Autumn.
                </p>
              }
            >
              <div></div>
            </Step>
          </>
        )}
      </div>
    </div>
  );
}

export default OnboardingView;
