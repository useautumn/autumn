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
import { APIPlayground } from "./APIPlayground";

// const endpoint = "https://app.useautumn.com";
const endpoint = "http://localhost:8080";

export default function MintDemoView({
  publishableKey,
  secretKey,
}: {
  publishableKey: string;
  secretKey: string;
}) {
  const customerId = "hahnbee";
  const eventName = "chat-responses";

  const axiosInstance = axios.create({
    baseURL: endpoint,
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  });

  const {
    data: customer,
    error,
    isLoading: customerLoading,
    mutate: cusMutate,
  } = useDemoSWR({
    url: `/public/customers/${customerId}`,
    publishableKey: publishableKey!,
  });

  const hasAccessRequest = {
    customer_id: customerId,
    feature_id: eventName,
  };

  const sendEventRequest = {
    customer_id: customerId,
    event_name: eventName,
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

  const [message, setMessage] = useState("");
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      // const hasProModels = await checkPremiumModels();
      // setHasProModels(hasProModels);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    setGetCustomerResponse(customer?.entitlements);
  }, [customer]);

  //Check access to Pro features and email balance
  const checkAccess = async (featureId: string) => {
    const { data } = await axiosInstance.post("/v1/entitled", {
      customer_id: customerId,
      feature_id: featureId,
    });
    return data;
  };

  //Send usage event for email
  const sendUsage = async (featureId: string) => {
    const { data } = await axiosInstance.post("/v1/events", {
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
    <AutumnProvider publishableKey={publishableKey} endpoint={endpoint}>
      <div className="w-full h-fit bg-white flex justify-start absolute top-0 left-0">
        <div className="flex p-4 w-full gap-32 relative">
          <div className="flex flex-col gap-4 min-w-[700px]">
            {loading ? (
              <div className="flex justify-center items-center h-[500px]">
                <LoaderCircle className="animate-spin text-primary" size={30} />
              </div>
            ) : (
              <>
                <CustomToaster />
                <div className="text-xl font-extrabold mt-2 -mb-2">
                  Mintlify
                </div>
                <p className="text-lg">
                  Start building modern documentation in under five minutes
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search or ask..."
                    className="w-full"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <Button
                    isLoading={hasAccessLoading}
                    onClick={async () => handleClicked()}
                    className="font-semibold bg-gradient-to-b from-emerald-400 to-emerald-500 hover:bg-gradient-to-b hover:from-emerald-500 hover:to-emerald-600 border-t border-emerald-500"
                  >
                    Use AI Chat
                  </Button>
                  <Button
                    variant="gradientSecondary"
                    onClick={async () => {
                      const { data } = await axiosInstance.post(
                        "/v1/entitled",
                        {
                          customer_id: customerId,
                          feature_id: "editors",
                          event_data: {
                            event_name: "editors",
                            properties: {
                              value: 1,
                            },
                          },
                        }
                      );
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
                      const { data } = await axiosInstance.post(
                        "/v1/entitled",
                        {
                          customer_id: customerId,
                          feature_id: "editors",
                          required_quantity: -1,
                          event_data: {
                            event_name: "editors",
                            properties: {
                              value: -1,
                            },
                          },
                        }
                      );
                      console.log(data);
                      await cusMutate();
                    }}
                  >
                    Remove Editor
                  </Button>
                </div>
                <div className="text-lg font-semibold mt-4 -mb-3">Account</div>
                <p className="text-sm text-t3">
                  Hi {customer?.name ? customer?.name : customerId}, you have
                  access to:
                </p>
                <CustomerBalances customer={customer} />
                <div className="text-lg font-semibold mt-2">Pricing</div>

                <PricingPage customerId={customerId} />

                <p className="text-xs text-t3">
                  You can make a test purchase to see what happens. Use the
                  Stripe test card{" "}
                  <span className="font-bold">4242 4242 4242 4242</span> with
                  any expiration date, CVC and cardholder details.
                </p>
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
    </AutumnProvider>
  );
}
