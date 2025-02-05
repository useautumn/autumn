"use client";

import axios from "axios";
import toast from "react-hot-toast";
import SmallSpinner from "@/components/general/SmallSpinner";
import { useState, useEffect } from "react";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import { AutumnProvider, PricingPage } from "@useautumn/react";
import { useAxiosSWR, useDemoSWR } from "@/services/useAxiosSwr";
import React from "react";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

const apiKey = "am_live_3ZavonZcha8ENdWwfHbrirU3";
const baseUrl = "https://api.useautumn.com/v1";
const headers = {
  Authorization: `Bearer ${apiKey}`,
};

const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers,
});

export default function DemoView() {
  const customerId = "123";

  const hasAccessRequest = {
    feature_id: "emails",
    customer_id: customerId,
  };

  const sendEventRequest = {
    event_name: "email",
    customer_id: customerId,
    properties: {},
  };

  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailBalance, setEmailBalance] = useState(0);
  const [hasProFeatures, setHasProFeatures] = useState<boolean>(false);

  const { data: customer, mutate: cusMutate } = useDemoSWR({
    url: `/customers/${customerId}`,
    apiKey,
  });

  console.log("Customer:", customer);
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // await checkFeatures();
      setLoading(false);
    };
    init();
  }, []);

  // //Attach Pro Plan to customer
  // const attachProduct = async () => {
  //   const { data } = await axiosInstance.post("/attach", {
  //     customer_id: customerId,
  //     product_id: "pro",
  //   });

  //   if (data.checkout_url) {
  //     window.open(data.checkout_url, "_blank");
  //   } else {
  //     toast.success("Card already on file: automatically upgraded to Pro Plan");
  //   }
  // };

  //Check access to Pro features and email balance
  const checkAccess = async (featureId: string) => {
    // const { data } = await axiosInstance.get(
    //   `/entitled?customer_id=${customerId}&feature_id=${featureId}`
    // );
    // return data;
  };

  //Send usage event for email
  const sendUsage = async (eventName: string) => {
    const { data } = await axiosInstance.post("/events", {
      customer_id: customerId,
      event_name: eventName,
      properties: {},
    });

    // toast.success("Scrape successful");
    return data;
  };

  const handleClicked = async (eventName: string) => {
    // setHasAccessLoading(true);
    // const data = await checkAccess(eventName);
    // setEmailBalance(data.balances[0].balance);
    // setHasAccessLoading(false);
    // setHasAccessResponse(data);
    // if (!data.allowed) {
    //   toast.error("You're out of " + eventName);
    //   return;
    // }
    // setSendEventLoading(true);
    // const eventData = await sendUsage("email");
    // setSendEventResponse(eventData);
    // setSendEventLoading(false);
    // setEmailBalance(emailBalance - 1);
  };

  return (
    <div className="flex gap-12 p-4">
      <div className="flex flex-col gap-4 w-full">
        {loading ? (
          <div className="flex justify-center items-center h-[500px]">
            <LoaderCircle className="animate-spin text-primary" size={30} />
          </div>
        ) : (
          <>
            <AutumnProvider
              publishableKey={
                process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY || ""
              }
            >
              <PricingPage customerId={customerId} />
            </AutumnProvider>
            <CustomToaster />

            <Card>
              {customer && (
                <React.Fragment>
                  <CardContent className="flex flex-col gap-2 pt-8">
                    {customer.entitlements.map((entitlement) => (
                      <div
                        key={entitlement.feature_id}
                        className="flex justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            {keyToTitle(entitlement.feature_id)}
                          </p>
                          <span className="text-lg font-semibold">
                            {entitlement.balance || "Allowed"}
                          </span>
                        </div>
                        <Button
                          onClick={() => handleClicked(entitlement.feature_id)}
                          className="w-[200px]"
                        >
                          Use {keyToTitle(entitlement.feature_id)}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </React.Fragment>
              )}
            </Card>

            {/* <Card>
              <CardHeader className="flex justify-between p-3 px-4">
                <div className="flex justify-between items-center gap-4">
                  <div className="flex flex-col gap-0">
                    <p className="text-sm font-medium text-gray-600">
                      Email Balance:
                    </p>
                    <span className="text-lg font-semibold">
                      {emailBalance || 0}
                    </span>
                  </div>
                  <Button
                    onClick={() => handleClicked("emails")}
                    className="bg-blue-500 hover:bg-blue-600 transition-colors w-48"
                  >
                    Send Email
                  </Button>
                </div>
                <Button onClick={() => handleClicked("ai")}>Use AI</Button>
              </CardHeader>
            </Card> */}
            {hasProFeatures ? (
              <div>
                <div className="space-y-4">
                  <p className="font-semibold text-lg">Pro Analytics</p>

                  <div className="grid grid-cols-2 gap-2">
                    <Card>
                      <CardHeader>
                        <h4 className="text-lg">User Activity</h4>
                        <div className="flex items-center gap-2">
                          <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                            <span className="text-xl font-bold text-white">
                              87
                            </span>
                          </div>
                          <div>
                            <p className="text-sm text-zinc-500">
                              Active Users
                            </p>
                            <p className="text-green-500 text-sm">
                              ↑ 1% from last week
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>

                    <Card>
                      <CardHeader>
                        <h4 className="text-lg">Engagement</h4>
                        <div className="flex items-center gap-2">
                          <div className="h-12 w-12 rounded-full bg-purple-500 flex items-center justify-center">
                            <span className="text-xl font-bold text-white">
                              5.2
                            </span>
                          </div>
                          <div>
                            <p className="text-sm text-zinc-500">
                              Avg Session (min)
                            </p>
                            <p className="text-red-500 text-sm">
                              ↓ 3% from last week
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p>You do not have access to pro features</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="w-2/4 space-y-4 bg-gray-900 p-4">
        <APIPlayground
          title="Check Entitlement"
          endpoint="GET /entitled"
          request={hasAccessRequest}
          response={hasAccessResponse}
          loading={hasAccessLoading}
        />

        <APIPlayground
          title="Send Usage Event"
          endpoint="POST /events"
          request={sendEventRequest}
          response={sendEventResponse}
          loading={sendEventLoading}
        />
      </div>
    </div>
  );
}

const APIPlayground = ({
  title,
  endpoint,
  request,
  response,
  loading,
}: {
  title: string;
  endpoint: string;
  request: any;
  response: any;
  loading: boolean;
}) => {
  return (
    <div className="border border-gray-700 flex flex-col gap-4 p-4 bg-gray-900">
      <h3 className="font-bold text-white">{title}</h3>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Endpoint</p>
        <pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
          {endpoint}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Request</p>
        <pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
          {JSON.stringify(request, null, 2)}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Response</p>
        <pre className="bg-gray-600 p-2 rounded text-sm text-gray-200">
          {loading ? (
            <SmallSpinner />
          ) : response === null ? (
            "No response"
          ) : (
            JSON.stringify(response, null, 2)
          )}
        </pre>
      </div>
    </div>
  );
};

{
  /* <Card>
              <CardHeader className="flex justify-between p-3 px-4">
                <div className="flex justify-between items-center gap-4">
                  <div className="flex flex-col gap-0">
                    <p className="text-lg font-semibold text-gray-600">
                      Upgrade to Pro Plan
                    </p>
                  </div>
                  <Button
                    isLoading={buyLoading}
                    onClick={async () => {
                      setBuyLoading(true);
                      // setQuantities({
                      //   enrichment: parseInt(quantities.enrichment),
                      //   ai: parseInt(quantities.ai),
                      // });
                      await attachProduct();
                      setBuyLoading(false);
                    }}
                    disabled={hasProFeatures === true}
                    className="bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 hover:from-green-500 hover:via-yellow-500 hover:to-pink-500 transition-all duration-700 w-48 shadow-[0_0_15px_rgba(168,85,247,0.5)] hover:shadow-[0_0_20px_rgba(236,72,153,0.7)] bg-[size:200%] hover:bg-right"
                  >
                    Buy Pro
                  </Button>
                </div>
              </CardHeader>
            </Card> */
}
