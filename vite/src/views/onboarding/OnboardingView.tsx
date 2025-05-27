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
import {
  AlertTriangle,
  ArrowUpRightFromSquare,
  Book,
  Code,
} from "lucide-react";
import { CreateOrgStep } from "./onboarding-steps/CreateOrg";
import { ConnectStripeStep } from "./onboarding-steps/ConnectStripe";
import { CreateProductStep } from "./onboarding-steps/CreateProduct";
import { CreateSecretKey } from "./onboarding-steps/CreateSecretKey";
import AttachProduct from "./onboarding-steps/AttachProduct";
import CheckAccessStep from "./onboarding-steps/CheckAccess";
import Install from "./onboarding-steps/Install";
import LoadingScreen from "../general/LoadingScreen";
import { ProductList } from "./onboarding-steps/ProductList";
import { useCreateOrg } from "./hooks/useCreateOrg";
import EnvStep from "./onboarding-steps/Env";
import MountHandler from "./onboarding-steps/MountHandler";
import { Button } from "@/components/ui/button";
import AutumnProvider from "./onboarding-steps/AutumnProvider";
import { SampleApp } from "./onboarding-steps/SampleApp";
import IntegrationGuideStep from "./onboarding-steps/IntegrationGuide";

function OnboardingView() {
  const env = useEnv();

  const { organization: org } = useOrganization();
  const [searchParams] = useSearchParams();

  const [apiKey, setApiKey] = useState("");
  const [showIntegrationSteps, setShowIntegrationSteps] = useState(false);

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

  useCreateOrg({ productMutate });

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
            <SampleApp data={productData} mutate={productMutate} number={3} />
            <IntegrationGuideStep
              number={4}
              showIntegrationSteps={showIntegrationSteps}
              setShowIntegrationSteps={setShowIntegrationSteps}
            />

            {showIntegrationSteps && (
              <div className="flex flex-col animate-in fade-in-0 duration-500">
                <ConnectStripeStep
                  mutate={productMutate}
                  productData={productData}
                  number={5}
                />
                <Install number={6} />

                <EnvStep number={7} />

                <MountHandler number={8} />

                <AutumnProvider number={9} />

                <AttachProduct
                  products={productData.products}
                  apiKey={apiKey}
                  number={10}
                />

                <CheckAccessStep
                  apiKey={apiKey}
                  features={productData.features}
                  products={productData.products}
                  number={11}
                />

                <Step
                  title="Done!"
                  number={12}
                  description={
                    <p>
                      You&apos;re all set! Autumn is tracking your customers'
                      usage, what they have access to and how much they should
                      be billed. <br /> <br /> Go to the Customers tab to manage
                      your users, and read our{" "}
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default OnboardingView;
