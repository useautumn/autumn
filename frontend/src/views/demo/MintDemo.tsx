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

const endpoint = "https://api.useautumn.com";
// const endpoint = "http://localhost:8080";

export default function MintDemo({
  publishableKey,
  secretKey,
}: {
  publishableKey: string;
  secretKey: string;
}) {
  const [eventName, setEventName] = useState("chat-responses");
  const customerId = "hahnbee";

  const axiosInstance = axios.create({
    baseURL: endpoint + "/v1",
    headers: {
      "Content-Type": "application/json",
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
    publishableKey: publishableKey || "",
  });

  const hasAccessRequest = {
    customer_id: customerId,
    feature_id: eventName,
  };

  const sendEventRequestChat = {
    customer_id: customerId,
    event_name: "chat-responses",
  };

  const sendEventRequestEditorsPlus = {
    customer_id: customerId,
    event_name: "editors",
    properties: {
      value: 1,
    },
  };

  const sendEventRequestEditorsMinus = {
    customer_id: customerId,
    event_name: "editors",
    properties: {
      value: -1,
    },
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

  //Check access to Pro features and email balance
  const checkAccess = async (featureId: string) => {
    const { data } = await axiosInstance.post("/entitled", {
      customer_id: customerId,
      feature_id: featureId,
    });
    return data;
  };

  //Send usage event for
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
    const data = await checkAccess("chat-responses");
    setHasAccessResponse(data);
    await setSendEventRequest(sendEventRequestChat);
    setHasAccessLoading(false);

    if (!data.allowed) {
      toast.error("You're out of " + eventName);
      return;
    }

    setSendEventLoading(true);
    const eventData = await sendUsage("chat-responses");
    setSendEventResponse(eventData);
    setSendEventLoading(false);
    await cusMutate();
  };

  return (
    <AutumnProvider publishableKey={publishableKey || ""} endpoint={endpoint}>
      <div className="w-full h-fit bg-white flex absolute top-0 left-0 flex-nowrap">
        <div className="flex w-full gap-32 relative">
          <div className="w-[150px] bg-stone-100 border-r flex flex-col h-screen fixed left-0 top-0">
            <div className="p-4 flex items-center gap-2 border-b">
              <div className="w-6 h-6 rounded-full bg-gray-900"></div>
              <span className="font-medium">autumn</span>
            </div>

            <div className="flex flex-col h-full p-2 space-y-1">
              <SidebarItem icon="📊" text="Overview" active />
              <SidebarItem icon="📝" text="Editor" />
              <SidebarItem icon="📈" text="Analytics" />
              <SidebarItem icon="⚙️" text="Settings" />

              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="text-xs text-gray-500 px-3 pt-4 pb-2">
                    Products
                  </div>
                  <SidebarItem icon="💬" text="Chat" />
                  <SidebarItem icon="🤖" text="Assistant" />
                  <SidebarItem icon="🔒" text="Authentication" />
                  <SidebarItem icon="🧩" text="Add-ons" />
                </div>
                <div className="">
                  <SidebarItem icon="📚" text="Documentation" />
                  <SidebarItem icon="👥" text="Invite Members" />
                  <SidebarItem icon="❓" text="Support" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-2 w-full ml-60">
            {loading ? (
              <div className="flex justify-center items-center h-[500px]">
                <LoaderCircle className="animate-spin text-primary" size={30} />
              </div>
            ) : (
              <>
                <CustomToaster />
                <div className="flex gap-4 items-center">
                  <div className="text-xl font-extrabold mt-6 -mb-2">
                    Mintlify
                  </div>
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
                      setEventName("editors");
                      setSendEventRequest(sendEventRequestEditorsPlus);
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
                      setHasAccessResponse(data);
                      if (!data.allowed) {
                        toast.error("You're out of editors");
                      }
                      await cusMutate();
                    }}
                  >
                    Add Editor
                  </Button>
                  <Button
                    variant="gradientSecondary"
                    onClick={async () => {
                      setEventName("editors");
                      setSendEventRequest(sendEventRequestEditorsMinus);
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
                      setHasAccessResponse(data);
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

                <div className="py-6 border-b border-t h-fit">
                  <h1 className="text-lg font-medium">Good evening, Autumn</h1>
                  <p className="text-t3">
                    Welcome back to your documentation portal
                  </p>

                  <div className="flex gap-6 mt-6 rounded-lg pb-4 pt-2 h-fit">
                    <Image
                      src="/demo-assets/Dashboard.png"
                      alt="Dashboard Preview"
                      width={600}
                      height={375}
                      className="w-[300px] h-[200px] rounded-md border shadow-sm"
                    />

                    <div className="mt-4 flex flex-col h-[170px] justify-between">
                      <div className="flex flex-col">
                        <div className="px-2 py-1 rounded-full w-fit bg-green-100 text-green-600 text-sm mb-2">
                          Live
                        </div>
                        <span className="text-sm text-gray-600">
                          Last updated 1 week ago by Ayush
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-gray-100 rounded">
                          <span className="text-gray-600">📋</span>
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded">
                          <span className="text-gray-600">🔄</span>
                        </button>
                        <button
                          className="px-3 py-1 bg-black text-white rounded-md text-sm min-w-fit"
                          onClick={() => {
                            window.open("https://docs.useautumn.com", "_blank");
                          }}
                        >
                          Visit docs
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-lg font-medium mt-4 -mb-3">Billing</div>
                <p className="text-sm text-t3">
                  {customer?.name ? customer?.name : customerId}, you have
                  access to:
                </p>
                <CustomerBalances customer={customer} />
                <div className="text-lg font-medium mt-2">Pricing</div>

                <div className="max-w-[600px]">
                  <PricingPage customerId={customerId} />
                </div>

                <p className="text-xs text-t3">
                  Make a test purchase to see how Autumn handles it. Use the
                  Stripe test card{" "}
                  <span className="font-bold">4242 4242 4242 4242</span> with
                  any expiration date, CVC and cardholder details.
                </p>
              </>
            )}
          </div>
          <div className="w-full space-y-4 flex flex-col gap-4 max-w-[400px] bg-gray-900 p-4 rounded-sm">
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

function SidebarItem({
  icon,
  text,
  active = false,
}: {
  icon: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 ${
        active ? "bg-gray-100" : ""
      }`}
    >
      <span>{icon}</span>
      <span className="text-sm">{text}</span>
    </div>
  );
}
