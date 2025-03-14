"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { toast } from "react-hot-toast";
import {
  useOrganization,
  useOrganizationList,
  useUser,
} from "@clerk/clerk-react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import Step from "@/components/general/OnboardingStep";
import ConnectStripe from "./ConnectStripe";
import { FeaturesTable } from "../features/FeaturesTable";
import { AppEnv, Feature } from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FeaturesContext } from "../features/FeaturesContext";
import SmallSpinner from "@/components/general/SmallSpinner";
import ConfettiExplosion from "react-confetti-explosion";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CopyPublishableKey } from "../developer/DevView";
import { useEnv } from "@/utils/envUtils";
import LoadingScreen from "../general/LoadingScreen";
import { navigateTo } from "@/utils/genUtils";

function OnboardingView() {
  const env = useEnv();
  const { user } = useUser();
  // Started without org...

  const { organization: org } = useOrganization();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiCreated, setApiCreated] = useState(false);
  const [orgCreated, setOrgCreated] = useState(org ? true : false);
  const navigate = useNavigate();

  const [fields, setFields] = useState({
    name: org?.name || "",
    slug: "",
  });

  const { createOrganization, setActive } = useOrganizationList();

  const axiosInstance = useAxiosInstance({ env });

  const {
    data: productData,
    mutate: productMutate,
    isLoading: productLoading,
  } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  const publishableKey =
    env === AppEnv.Sandbox
      ? productData?.org?.test_pkey
      : productData?.org?.live_pkey;

  const features = productData?.features.filter(
    (feature: Feature) => feature.type !== "credit_system"
  );

  const pollForOrg = async () => {
    for (let i = 0; i < 10; i++) {
      console.log("polling for org, attempt", i);
      const requiredProdLength = env == AppEnv.Sandbox ? 2 : 0;
      try {
        const response = await axiosInstance.get("/products/data");
        const pollingData = response.data;

        if (pollingData?.products.length != requiredProdLength) {
          throw new Error("Products not created");
        }
        await setOrgCreated(true);
        await productMutate();
        return;
      } catch (error) {
        console.log("error", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    window.location.reload();
  };

  useEffect(() => {
    const toastMessage = searchParams.get("toast");
    if (toastMessage) {
      toast.error(toastMessage);
    }
  }, [searchParams]);

  useEffect(() => {
    if (org && !orgCreated) {
      pollForOrg();
    }
  }, [org, orgCreated]);

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

      await setActive({ organization: org.id });
      await pollForOrg();
      toast.success(`Created your organization: ${org.name}`);
      setIsExploding(true);
    } catch (error: any) {
      if (error.message) {
        toast.error(error.message);
      } else {
        toast.error("Error creating organization");
      }
    }
    setLoading(false);
  };

  return (
    <div className="text-sm">
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
              {/* {showOrgSwitcher && (
                <div className="flex flex-col gap-2">
                  <p>Select an organization!</p>
                  <OrganizationSwitcher
                    hidePersonal={true}
                    appearance={{
                      elements: {
                        organizationSwitcherTrigger:
                          "bg-gradient-to-b font-semibold border border-primary from-primary/65 to-primary text-white hover:from-primary hover:to-primary shadow-sm shadow-purple-500/50 !text-white",
                        userPreview: "!text-white",
                      },
                    }}
                  />
                </div>
              )} */}
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

        {orgCreated && (
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
            <Step title="Set up your pricing model">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <div className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
                  <p>
                    First, create your{" "}
                    <span className="font-bold">Features</span>, the parts of
                    your application you charge for.
                  </p>
                  <p>
                    Then, create your{" "}
                    <span className="font-bold">Products</span>, which are the
                    pricing plans that grant access to those features.
                  </p>
                  <p>Some examples have been created for you.</p>
                </div>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex flex-col gap-6">
                  <FeaturesContext.Provider
                    value={{
                      features: features,
                      env,
                      mutate: productMutate,
                      onboarding: true,
                    }}
                  >
                    {productLoading ? (
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
            <Step title="Create an Autumn Secret Key">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <div className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
                  <p>
                    Your <span className="font-bold">Publishable Key</span> is
                    safe for frontend use. It&apos;s limited to non-sensitive
                    operations, like getting a Stripe Checkout URL and feature
                    access checks.
                  </p>
                  <p>
                    Your <span className="font-bold">Secret Key</span> belongs
                    on your backend server and has full API access, including
                    for sending usage events.
                  </p>
                </div>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex gap-2 bg-white p-4 rounded-sm border h-fit">
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
                    <div className="flex flex-col gap-2 w-full">
                      <div className="border rounded-sm px-2 py-1">
                        {env === AppEnv.Sandbox ? (
                          <CopyPublishableKey
                            type="Sandbox"
                            value={productData?.org?.test_pkey}
                          />
                        ) : (
                          <CopyPublishableKey
                            type="Production"
                            value={productData?.org?.live_pkey}
                          />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Secret API Key Name"
                          value={apiKeyName}
                          disabled={apiCreated}
                          onChange={(e) => setApiKeyName(e.target.value)}
                        />
                        <CreateAPIKey />
                      </div>
                    </div>
                  </DevContext.Provider>
                </div>
              </div>
            </Step>
            <Step title="Attach a Product">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <div className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
                  <p>
                    The <span className="font-mono text-red-500">/attach</span>{" "}
                    endpoint will return a Stripe Checkout URL that you should
                    redirect your user to, when they want to purchase one of the
                    products above.
                  </p>
                  <p>
                    You can do this directly from your frontend using the
                    Publishable API Key.
                  </p>
                </div>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl">
                  <CodeDisplay
                    code={`const response = await fetch('https://api.useautumn.com/v1/attach', {
  method: "POST",
  headers: {Authorization: 'Bearer ${publishableKey}', 'Content-Type': 'application/json'},
  body: JSON.stringify(
    {
      "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID
      "product_id": "pro" //Set above in the 'Products' table
    }
  )
})

const data = await response.json();
const checkoutUrl = data.checkout_url;

// Redirect the user to the checkout URL
window.location.href = checkoutUrl;
`}
                    language="javascript"
                  />
                </div>
              </div>
            </Step>
            <Step title="Check if user has access to a feature and send usage events">
              <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
                <p className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
                  <span>
                    If you have a feature with access restrictions, check
                    whether a user can access it by calling the{" "}
                    <span className="font-mono text-red-500">/entitled</span>{" "}
                    endpoint.
                  </span>
                  <span>
                    If it&apos;s a metered (usage-based) feature, send us the
                    usage data by calling the{" "}
                    <span className="font-mono text-red-500">/events</span>{" "}
                    endpoint. You must use your{" "}
                    <span className="font-bold">Secret API Key</span> for this.
                  </span>
                </p>
                <div className="w-full lg:w-2/3 min-w-md max-w-xl flex flex-col gap-2">
                  <h2 className="text-t2 font-medium text-md">
                    Check Feature Access
                  </h2>
                  <CodeDisplay
                    code={`const response = await fetch('https://api.useautumn.com/v1/entitled', {
  method: "POST",
  headers: {Authorization: 'Bearer ${publishableKey}', 'Content-Type': 'application/json'},
  body: JSON.stringify(
    {
      "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID
      "feature_id": "chat-messages" //Set above in the 'Features' table
    }
  )
})`}
                    language="javascript"
                  />

                  <h2 className="text-t2 font-medium text-md mt-4">
                    Send Usage Events
                  </h2>
                  <CodeDisplay
                    code={`await fetch('https://api.useautumn.com/v1/events', {
  method: "POST",
  headers: {Authorization: 'Bearer <AUTUMN_SECRET_API_KEY>', 'Content-Type': 'application/json'},
  body: JSON.stringify(
    {
      "customer_id": "<YOUR_INTERNAL_USER_ID>", //Use your internal user ID
      "event_name": "chat-message" //Set above in the 'Features' table
    }
  )
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
    </div>
  );
}

export default OnboardingView;
