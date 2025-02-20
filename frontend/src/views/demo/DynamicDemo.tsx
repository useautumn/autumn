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
import Image from "next/image";
import { checkAccess, createAxiosInstance, sendUsage } from "./autumnBackend";
import DemoSidebar from "./DemoSidebar";

// const endpoint = "https://api.useautumn.com";
// const endpoint = "http://localhost:8080";
const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;

const data = {
  companyName: "Keywords",
  customerId: "hahnbee",
};

const buttons = [
  {
    feature_id: "log-ingestion",
    text: "Ingest Logs",
    value: 100,
  },
];

export default function DynamicDemo({
  publishableKey,
  secretKey,
}: {
  publishableKey: string;
  secretKey: string;
}) {
  const [eventName, setEventName] = useState("chat-responses");
  // const customerId = "hahnbee";

  const { companyName, customerId } = data;

  const axiosInstance = createAxiosInstance(secretKey, endpoint!);

  const {
    data: customer,
    error,
    isLoading: customerLoading,
    mutate: cusMutate,
  } = useDemoSWR({
    url: `/public/customers/${customerId}`,
    publishableKey: publishableKey || "",
    endpoint: endpoint,
  });

  const hasAccessRequest = {
    customer_id: customerId,
    feature_id: eventName,
  };

  const sendEventRequestChat = {
    customer_id: customerId,
    event_name: eventName,
  };

  const getCustomerRequest = {
    customer_id: customerId,
  };

  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [sendEventRequest, setSendEventRequest] =
    useState(sendEventRequestChat);
  const [getCustomerResponse, setGetCustomerResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setGetCustomerResponse(customer?.entitlements);
  }, [customer]);

  const handleBtnClicked = async ({
    featureId,
    value,
  }: {
    featureId: string;
    value: number;
  }) => {
    setHasAccessLoading(true);
    const data = await checkAccess({
      axiosInstance,
      customerId,
      featureId,
    });
    setHasAccessResponse(data);
    setHasAccessLoading(false);

    if (!data.allowed) {
      toast.error("You're out of " + featureId);
      return;
    }

    setSendEventLoading(true);
    const eventData = await sendUsage({
      axiosInstance,
      customerId,
      featureId,
      value,
    });
    setSendEventResponse(eventData);
    setSendEventLoading(false);
    await cusMutate();
  };

  return (
    <AutumnProvider publishableKey={publishableKey || ""} endpoint={endpoint}>
      <div className="w-screen h-screen flex justify-between overflow-x-hidden">
        <DemoSidebar />
        <div className="flex flex-col gap-4 flex-2 w-full px-10 pt-4">
          <CustomToaster />
          <div className="flex gap-4 items-center">
            <div className="text-xl font-extrabold">{companyName}</div>
          </div>

          <div className="flex gap-2">
            {buttons.map((button, index) => (
              <Button
                key={index}
                isLoading={hasAccessLoading}
                onClick={async () =>
                  handleBtnClicked({
                    featureId: button.feature_id,
                    value: button.value,
                  })
                }
                variant="gradientPrimary"
              >
                {button.text}
              </Button>
            ))}
          </div>

          <div className="text-lg font-medium mt-4 -mb-3">Billing</div>
          <p className="text-sm text-t3">
            {customer?.name ? customer?.name : customerId}, you have access to:
          </p>
          <CustomerBalances customer={customer} />
          <div className="text-lg font-medium mt-2">Pricing</div>

          <div className="min-w-[600px]">
            <PricingPage customerId={customerId} />
          </div>

          <p className="text-xs text-t3">
            Make a test purchase to see how Autumn handles it. Use the Stripe
            test card <span className="font-bold">4242 4242 4242 4242</span>{" "}
            with any expiration date, CVC and cardholder details.
          </p>
        </div>
        <div className="w-[600px] space-y-4 flex flex-col bg-gray-900 p-4 h-full min-h-fit">
          <Image
            src="/demo-assets/autumn-logo.png"
            alt="Autumn Logo"
            width={100}
            height={100}
          />
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
          {/* <APIPlayground
            title="Get Customer"
            endpoint="GET /customers/:customer_id"
            request={getCustomerRequest}
            response={getCustomerResponse}
            loading={customerLoading}
          /> */}
        </div>
      </div>
    </AutumnProvider>
  );
}
