"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { CustomToaster } from "@/components/general/CustomToaster";
import { toast } from "react-hot-toast";
import { useOrganizationList } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Step from "@/components/ui/step";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectStripe from "./ConnectStripe";
import { FeaturesTable } from "../features/FeaturesTable";
import { AppEnv, Feature } from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FeaturesContext } from "../features/FeaturesContext";
import SmallSpinner from "@/components/general/SmallSpinner";
import ConfettiExplosion from "react-confetti-explosion";
import { createClient } from "@supabase/supabase-js";
import { navigateTo } from "@/utils/genUtils";
import { useRouter } from "next/navigation";
import { CreateFeature } from "../features/CreateFeature";
import { ProductsContext } from "../products/ProductsContext";
import { ProductsTable } from "../products/ProductsTable";
import CreateProduct from "../products/CreateProduct";
import CreateAPIKey from "../developer/CreateAPIKey";
import { DevContext } from "../developer/DevContext";
import { CodeDisplay } from "@/components/general/CodeDisplay";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding,
  faExternalLinkAlt,
} from "@fortawesome/pro-duotone-svg-icons";
const SUPABASE_URL = "https://tqjsbqmimvflvkwdoucx.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxanNicW1pbXZmbHZrd2RvdWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyNjU0NTEsImV4cCI6MjA1MTg0MTQ1MX0.ndNu1-ObwQy5rzbmqQPvNRCG6z4GYkZKy_WkGo3AXNs";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function OnboardingView({
  sessionClaims,
  env,
}: {
  sessionClaims: any;
  env: AppEnv;
}) {
  const { org_id, user, org } = sessionClaims || {};
  const searchParams = useSearchParams();
  const { createOrganization, setActive } = useOrganizationList();
  const [loading, setLoading] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [orgId, setOrgId] = useState(org_id);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiCreated, setApiCreated] = useState(false);
  //get features for the org
  const {
    data,
    isLoading,
    error,
    mutate: featuresMutate,
  } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
  });

  const features = data?.features.filter(
    (feature: Feature) => feature.type !== "credit_system"
  );

  //get products for the org
  const {
    data: productData,
    mutate: productMutate,
    isLoading: productLoading,
  } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  //supabase realtime to update products and features when org is created
  useEffect(() => {
    if (!orgId) return;

    supabase
      .channel(orgId)
      .on(
        "broadcast",
        {
          event: "org.created",
        },
        async (payload) => {
          console.log("org created");
          await featuresMutate();
          await productMutate();
        }
      )
      .subscribe();
  }, [orgId, featuresMutate, productMutate]);

  useEffect(() => {
    const toastMessage = searchParams.get("toast");
    if (toastMessage) {
      toast.error(toastMessage);
    }
  }, [searchParams]);

  const handleCreateOrg = async () => {
    setLoading(true);

    try {
      if (!createOrganization) {
        toast.error("Error creating organization");
        return;
      }

      const org = await createOrganization({
        name: fields.name,
      });
      setOrgId(org.id);
      console.log("org id", org.id);
      await setActive({ organization: org.id });
      toast.success(`Created your organization: ${org.name}`);

      // window.location.href = "/sandbox/products";
      setIsExploding(true);
    } catch (error: any) {
      if (error.message) {
        toast.error(error.message);
      } else {
        toast.error("Error creating organization");
      }
    }
    setLoading(false);
    if (env !== AppEnv.Sandbox) window.location.href = "/sandbox/onboarding";
  };

  // const [slugEditted, setSlugEditted] = useState(false);
  const [fields, setFields] = useState({
    name: org?.name || "",
    slug: "",
  });

  return (
    <>
      <CustomToaster />
      <div className="flex flex-col p-8">
        <Step title="Create your organization">
          <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
            <div className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
              <p className="flex items-center">
                <span>👋</span>
                <span className="font-bold bg-gradient-to-r from-orange-500 via-pink-500 to-primary w-fit bg-clip-text text-transparent">
                  &nbsp; Welcome to Autumn
                </span>
              </p>
              <p>
                Create an organization to get started and integrate pricing
                within 5 minutes.
              </p>
            </div>
            <div className="w-full lg:w-2/3 min-w-md max-w-xl flex gap-2 bg-white p-4 rounded-sm border">
              <Input
                placeholder="Org name"
                value={org?.name || fields.name}
                disabled={!!org?.name}
                onChange={(e) => {
                  const newFields = { ...fields, name: e.target.value };
                  setFields(newFields);
                  // if (!slugEditted) {
                  //   newFields.slug = slugify(e.target.value);
                  // }
                }}
              />
              <Button
                className="w-fit"
                disabled={!!org?.name}
                onClick={handleCreateOrg}
                isLoading={loading}
                variant="gradientPrimary"
                startIcon={
                  <FontAwesomeIcon icon={faBuilding} className="mr-2" />
                }
              >
                Create Organization
              </Button>
              {isExploding && (
                <ConfettiExplosion
                  force={0.8}
                  duration={3000}
                  particleCount={250}
                  zIndex={1000}
                  width={1600}
                  onComplete={() => {
                    console.log("complete");
                  }}
                />
              )}
            </div>
          </div>
        </Step>
        {/* <div>
            <FieldLabel>Slug</FieldLabel>
            <Input
              placeholder="Organization Slug"
              value={fields.slug}
              onChange={(e) => {
                setSlugEditted(true);
                setFields({ ...fields, slug: e.target.value });
              }}
            />
          </div> */}
        {org?.id && (
          <>
            <Step title="Connect your Stripe test account">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="text-t2 flex-col gap-2 w-full lg:w-1/3">
                  <span>
                    Paste in your{" "}
                    <a
                      className="text-primary underline font-semibold"
                      href="https://dashboard.stripe.com/test/apikeys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Stripe Test Key
                      <FontAwesomeIcon
                        className="ml-1 h-2.5 w-2.5"
                        icon={faExternalLinkAlt}
                      />
                    </a>{" "}
                  </span>
                  {/* <span>
                    You can add your live key later under the 'Connect to
                    Stripe' tab.
                  </span> */}
                </p>
                <ConnectStripe
                  className="w-full lg:w-2/3 min-w-md max-w-xl bg-white rounded-sm border p-6"
                  onboarding={true}
                />
              </div>
            </Step>
            <Step title="Set up your pricing models">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <div className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
                  <p>
                    <span className="font-bold">Features</span> are the benefits
                    your users are entitled to.{" "}
                    <span className="font-bold">Products</span> are how you
                    charge for them.
                  </p>
                  <p>
                    Define your own application features, and create the pricing
                    you want: subscriptions, usage-based, overages, credits, or
                    a a combination!
                  </p>
                </div>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex flex-col gap-6">
                  <FeaturesContext.Provider
                    value={{
                      features: features,
                      dbConns: data?.dbConns,
                      env,
                      mutate: featuresMutate,
                      onboarding: true,
                    }}
                  >
                    {isLoading ? (
                      <SmallSpinner />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-t2 font-medium text-md">Features</p>
                        <FeaturesTable />
                        <CreateFeature />
                      </div>
                    )}
                  </FeaturesContext.Provider>
                  <ProductsContext.Provider
                    value={{
                      ...productData,
                      env,
                      mutate: productMutate,
                      onboarding: true,
                    }}
                  >
                    {productLoading ? (
                      <SmallSpinner />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-t2 font-medium text-md">Products</p>
                        <ProductsTable products={productData?.products} />
                        <div>
                          <CreateProduct />
                        </div>
                      </div>
                    )}
                  </ProductsContext.Provider>
                </div>
              </div>
            </Step>
            <Step title="Create an Autumn API Key">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="text-t2 w-full lg:w-1/3">
                  Generate an API key to start integrating Autumn into your
                  application.
                </p>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex gap-2 bg-white p-4 rounded-sm border">
                  <DevContext.Provider
                    value={{
                      env,
                      mutate: () => {},
                      onboarding: true,
                      apiKeyName,
                      setApiKeyName,
                      apiCreated,
                      setApiCreated,
                    }}
                  >
                    <Input
                      placeholder="API Key Name"
                      value={apiKeyName}
                      disabled={apiCreated}
                      onChange={(e) => setApiKeyName(e.target.value)}
                    />
                    <CreateAPIKey />
                  </DevContext.Provider>
                </div>
              </div>
            </Step>
            <Step title="Attach a Product">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
                  Call this endpoint when a user wants to purchase one of the
                  products we defined above.
                  <span>
                    Autumn will return a Stripe checkout URL that you should
                    redirect the user to.
                  </span>
                </p>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl">
                  <CodeDisplay
                    code={`const response = await fetch('https://api.useautumn.com/v1/attach', {
  method: "POST",
  headers: {Authorization: 'Bearer <Autumn API Key>', 'Content-Type': 'application/json'},
  body: JSON.stringify({
    "customer_id": internal_user_id, //Use your internal user ID
    "product_id": "pro"
  })
})`}
                    language="javascript"
                  />
                </div>
              </div>
            </Step>
            <Step title="Check if user has access to a feature and send usage events">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
                  <span>
                    Check whether a user has access to any of the features we
                    defined above.
                  </span>
                  <span>
                    If it&apos;s a metered (usage-based) feature, send us the
                    usage data.
                  </span>
                </p>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex flex-col gap-2">
                  <h2 className="text-t2 font-medium text-md">Check Access</h2>
                  <CodeDisplay
                    code={`const response = await fetch('https://api.useautumn.com/v1/entitled', {
  method: "POST",
  headers: {Authorization: 'Bearer <Autumn API Key>', 'Content-Type': 'application/json'},
  body: JSON.stringify({
    "customer_id": internal_user_id, //Use your internal user ID
    "feature_id": "chat-messages"
  })
})`}
                    language="javascript"
                  />

                  <h2 className="text-t2 font-medium text-md mt-4">
                    Send Usage (if metered)
                  </h2>
                  <CodeDisplay
                    code={`await fetch('https://api.useautumn.com/v1/events', {
  method: "POST",
  headers: {Authorization: 'Bearer <Autumn API Key>', 'Content-Type': 'application/json'},
  body: JSON.stringify({
    "customer_id": internal_user_id, //Use your internal user ID
    "event_name": "chat-message"
  })
})`}
                    language="javascript"
                  />
                </div>
              </div>
            </Step>
            <Step title="Done!">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="text-t2 gap-2 w-full lg:w-1/3">
                  You&apos;re all set! Go to the Customers tab to manage your
                  users, and read our{" "}
                  <a
                    className="text-primary underline font-semibold break-none"
                    href="https://docs.useautumn.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                    <FontAwesomeIcon
                      className="ml-1 h-2.5 w-2.5"
                      icon={faExternalLinkAlt}
                    />
                  </a>{" "}
                  to learn more about what you can do with Autumn.
                </p>
              </div>
            </Step>
          </>
        )}
      </div>
    </>
  );
}

export default OnboardingView;
