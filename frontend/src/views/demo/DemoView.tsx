"use client";

import axios from "axios";
import toast from "react-hot-toast";
import SmallSpinner from "@/components/general/SmallSpinner";
import { useState, useEffect } from "react";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import { AutumnProvider, PricingPage } from "@useautumn/react";
import { useDemoSWR } from "@/services/useAxiosSwr";
import CustomerBalances from "./CustomerBalances";
import { Input } from "@/components/ui/input";

const apiKey = process.env.NEXT_PUBLIC_AUTUMN_API_KEY;
const publishableKey = process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY;
const baseUrl = "https://api.useautumn.com/v1";
const headers = {
  Authorization: `Bearer ${apiKey}`,
};

const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers,
});

const colorizeJSON = (json: any) => {
  const jsonString = JSON.stringify(json, null, 2);
  return jsonString?.replace(/\btrue\b|\bfalse\b/g, (match) =>
    match === "true"
      ? `<span class="text-lime-500">true</span>`
      : `<span class="text-red-400">false</span>`
  );
};

export default function DemoView() {
  const customerId = "hahnbee";
  const eventName = "chat-responses";

  const {
    data: customer,
    error,
    isLoading: customerLoading,
    mutate: cusMutate,
  } = useDemoSWR({
    url: `/public/customers/${customerId}`,
    publishableKey: publishableKey || "",
  });

  const hasAccessRequest = {
    customer_id: customerId,
    feature_id: eventName,
  };

  const sendEventRequest = {
    customer_id: customerId,
    event_name: eventName,
    // properties: {
    //   value: 1,
    // },
  };

  const getCustomerRequest = {
    customer_id: customerId,
  };

  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [getCustomerResponse, setGetCustomerResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasProModels, setHasProModels] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // const hasProModels = await checkPremiumModels();
      setHasProModels(hasProModels);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    setGetCustomerResponse(customer?.entitlements);
  }, [customer]);

  //Check access to Pro features and email balance
  const checkAccess = async (featureId: string) => {
    const { data } = await axiosInstance.post("/entitled", {
      customer_id: customerId,
      feature_id: featureId,
    });
    return data;
  };

  //Send usage event for email
  const sendUsage = async (featureId: string) => {
    const { data } = await axiosInstance.post("/events", {
      customer_id: customerId,
      event_name: featureId,
      properties: {
        value: 1,
      },
    });

    return data;
  };

  const handleClicked = async () => {
    setHasAccessLoading(true);
    const data = await checkAccess(eventName);
    setHasAccessResponse(data);
    setHasAccessLoading(false);

    if (!data.allowed) {
      toast.error("You're out of " + eventName);
      return;
    }

    setSendEventLoading(true);
    const eventData = await sendUsage(eventName);
    setSendEventResponse(eventData);
    setSendEventLoading(false);
    await cusMutate();
  };

  return (
    <div className="w-full h-fit bg-stone-50 flex justify-start absolute top-0 left-0">
      <div className="flex p-4 w-full gap-32 relative">
        <div className="flex flex-col gap-4 min-w-[700px]">
          {loading ? (
            <div className="flex justify-center items-center h-[500px]">
              <LoaderCircle className="animate-spin text-primary" size={30} />
            </div>
          ) : (
            <>
              <AutumnProvider publishableKey={publishableKey || ""}>
                <PricingPage customerId={customerId} />
              </AutumnProvider>
              {/* <div className="flex gap-2">
                <Button
                  variant="gradientPrimary"
                  onClick={async () => {
                    const { data } = await axiosInstance.post("/attach", {
                      customer_id: customerId,
                      product_id: "pro",
                      options: [
                        // {
                        //   feature_id: "team-members",
                        //   quantity: 2,
                        // },
                      ],
                    });
                    // console.log(data);

                    data.checkout_url &&
                      window.open(data.checkout_url, "_blank");
                  }}
                >
                  Buy Pro
                </Button>
              </div> */}
              <CustomToaster />
              <CustomerBalances customer={customer} />
              <div className="text-lg font-semibold mt-4">Mintlify App</div>
              <div className="flex gap-2">
                {/* <Input
                  placeholder="Enter message"
                  className="w-full"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                /> */}
                <Button
                  isLoading={hasAccessLoading}
                  onClick={async () => handleClicked()}
                  className="font-semibold bg-gradient-to-b border-b-2 border-red-500 from-red-500 to-red-300 hover:bg-gradient-to-r hover:from-green-500 hover:via-yellow-500 hover:to-pink-500 transition-all duration-700 w-48 shadow-[0_0_15px_rgba(168,85,247,0.5)] hover:shadow-[0_0_20px_rgba(236,72,153,0.7)] bg-[size:200%] hover:bg-right"
                >
                  Use AI Chat
                </Button>
                <Button
                  variant="gradientSecondary"
                  onClick={async () => {
                    const { data } = await axiosInstance.post("/entitled", {
                      customer_id: customerId,
                      feature_id: "editors",
                      event_data: {
                        event_name: "editors",
                        properties: {
                          value: 1,
                        },
                      },
                    });
                    console.log(data);
                    !data.allowed && toast.error("You're out of editors");
                    await cusMutate();
                  }}
                >
                  Add Editor
                </Button>
                <Button
                  variant="gradientSecondary"
                  onClick={async () => {
                    const { data } = await axiosInstance.post("/entitled", {
                      customer_id: customerId,
                      feature_id: "editors",
                      required_quantity: -1,
                      event_data: {
                        event_name: "editors",
                        properties: {
                          value: -1,
                        },
                      },
                    });
                    console.log(data);
                    await cusMutate();
                  }}
                >
                  Remove Editor
                </Button>
                {/* <Button
                  variant="gradientSecondary"
                  onClick={async () => {
                    const { data } = await axiosInstance.get(
                      `/customers/${customerId}/billing_portal`
                    );
                    window.open(data.url, "_blank");
                  }}
                >
                  Manage Subscription
                </Button> */}
              </div>

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
              {/* PRO FEATURES */}
              {/* {hasProFeatures ? (
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
              )} */}
            </>
          )}
        </div>
        <div className="w-2/4 space-y-4 flex flex-col gap-8 w-[500px] bg-gray-900 p-4 rounded-sm">
          <APIPlayground
            title="Check Feature Access"
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
          <APIPlayground
            title="Get Customer"
            endpoint="GET /customers/:customer_id"
            request={getCustomerRequest}
            response={getCustomerResponse}
            loading={customerLoading}
          />
        </div>
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
    <div className="flex flex-col gap-4 bg-gray-900 p-4 rounded-sm">
      <div className="flex flex-col gap-2">
        <p className="text-md font-semibold text-white">{title}</p>
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
            <div
              dangerouslySetInnerHTML={{
                __html: colorizeJSON(response),
              }}
            />
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
