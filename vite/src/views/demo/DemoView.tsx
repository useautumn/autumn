"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AutumnProvider, PricingPage } from "@useautumn/react";
import { useDemoSWR } from "@/services/useAxiosSwr";
import CustomerBalances from "./CustomerBalances";
import { APIPlayground } from "./APIPlayground";
import { checkAccess, createAxiosInstance, sendUsage } from "./autumnBackend";

const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;
const customerId = "ayush";

const buttons = [
  {
    value: 1,
    feature_id: "articles",
    display_name: "Send Article",
  },
];

export default function DynamicDemo() {
  const axiosInstance = createAxiosInstance(
    process.env.NEXT_PUBLIC_AUTUMN_API_KEY!,
    endpoint!
  );
  const publishableKey = process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY;

  console.log(publishableKey);
  console.log(process.env.NEXT_PUBLIC_AUTUMN_API_KEY);

  const {
    data: customer,
    error,
    isLoading: customerLoading,
    mutate: cusMutate,
  } = useDemoSWR({
    url: `/public/customers/${customerId}`,
    publishableKey: process.env.NEXT_PUBLIC_AUTUMN_PUBLISHABLE_KEY!,
    endpoint: endpoint,
  });

  const [entitledReq, setEntitledReq] = useState({});
  const [eventsReq, setEventsReq] = useState({});
  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [getCustomerRequest] = useState({ customer_id: customerId });
  const [getCustomerResponse, setGetCustomerResponse] = useState(null);

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
    if (value > 0) {
      setHasAccessLoading(true);
      setEntitledReq({
        customer_id: customerId,
        feature_id: featureId,
      });
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
    }

    setSendEventLoading(true);
    setEventsReq({
      customer_id: customerId,
      event_name: featureId,
      properties: {
        value,
      },
    });
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
      <div className="w-full h-screen flex justify-between">
        <div className="flex flex-col gap-4 w-full px-10 pt-4">
          <div className="flex gap-4 items-center">
            <div className="text-xl font-extrabold">Demo</div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {buttons.map((button, index) => (
              <ActionButton
                key={index}
                buttonData={button}
                handleClicked={() =>
                  handleBtnClicked({
                    featureId: button.feature_id,
                    value: button.value,
                  })
                }
              />
            ))}
          </div>

          <div className="text-lg font-medium mt-4 -mb-3">Billing</div>
          <p className="text-sm text-t3">You have access to:</p>
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
        <div className="space-y-4 flex flex-col bg-gray-900 p-4 h-full min-h-fit w-[400px]">
          {/* <Image
            src="/demo-assets/autumn-logo.png"
            alt="Autumn Logo"
            width={100}
            height={100}
          /> */}
          <APIPlayground
            title="Check Feature Access"
            endpoint="GET /entitled"
            request={entitledReq}
            response={hasAccessResponse}
            loading={hasAccessLoading}
          />
          <APIPlayground
            title="Send Usage Event"
            endpoint="POST /events"
            request={eventsReq}
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
    </AutumnProvider>
  );
}

export const ActionButton = ({
  buttonData,
  handleClicked,
}: {
  buttonData: any;
  handleClicked: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      isLoading={loading}
      onClick={async () => {
        setLoading(true);
        await handleClicked();
        setLoading(false);
      }}
      variant="gradientPrimary"
    >
      {buttonData.display_name}
    </Button>
  );
};
