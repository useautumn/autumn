"use client";

import { useState } from "react";
import axios from "axios";
import SmallSpinner from "@/components/general/SmallSpinner";
import { CustomToaster } from "@/components/general/CustomToaster";
import toast from "react-hot-toast";
import {
  Card,
  CardHeader,
  CardFooter,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const apiKey = "am_test_3ZcMpfUyb3Ybbcias3NLukrL";
const baseUrl = "https://api.useautumn.com/v1";
const headers = {
  Authorization: `Bearer ${apiKey}`,
};

const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers,
});

export default function DemoView() {
  const customerId = "test";
  const featureId = "enrichment-credits";
  const eventName = "enrichment";

  const hasAccessRequest = {
    feature_id: "enrichment-credits OR ai-credits",
    customer_id: customerId,
  };

  const sendEventRequest = {
    event_name: "enrich or ai",
    customer_id: customerId,
    properties: {},
  };

  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [buyLoading, setBuyLoading] = useState(false);

  const [quantities, setQuantities] = useState<any>({
    enrichment: "",
    ai: "",
  });

  const sendUsageUrl = "http://localhost:8080/v1/events";

  const buyStarter = async () => {
    const { data } = await axiosInstance.post("/attach", {
      customer_id: customerId,
      product_id: "starter",
      options: [
        {
          feature_id: "enrichment-credits",
          quantity: quantities.enrichment,
        },
        {
          feature_id: "ai-credits",
          quantity: quantities.ai,
        },
      ],
    });

    console.log(data);

    if (data.checkout_url) {
      window.open(data.checkout_url, "_blank");
    } else {
      toast.success("Successfully bought starter");
    }
  };

  const checkAccess = async (featureId: string) => {
    const { data } = await axiosInstance.get(
      `/entitled?customer_id=${customerId}&feature_id=${featureId}`,
      {
        headers,
      }
    );

    if (!data.allowed) {
      toast.error("You're out of credits.");
    }

    return data;
  };

  const sendUsage = async (eventName: string) => {
    const { data } = await axiosInstance.post("/events", {
      event_name: eventName,
      customer_id: customerId,
      properties: {},
    });

    toast.success("Scrape successful");
    return data;
  };

  const handleClicked = async (type: "enrich" | "ai") => {
    setHasAccessLoading(true);
    const data = await checkAccess(
      type === "enrich" ? "enrichment-credits" : "ai-credits"
    );
    setHasAccessLoading(false);
    setHasAccessResponse(data);

    if (!data.allowed) {
      return;
    }

    setSendEventLoading(true);
    const eventData = await sendUsage(eventName);
    setSendEventResponse(eventData);
    setSendEventLoading(false);
  };

  return (
    <div className="flex gap-12 p-4">
      <div className="flex flex-col gap-4">
        <CustomToaster />
        <Card className="rounded-md shadow-md border w-[300px]">
          <CardHeader>
            <h3 className="font-bold">Starter Plan</h3>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Enrichment Credits"
                value={quantities.enrichment}
                onChange={(e) =>
                  setQuantities({ ...quantities, enrichment: e.target.value })
                }
              />
              <p className="text-t3 text-sm w-[50px]">x 100</p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="AI Credits"
                value={quantities.ai}
                onChange={(e) =>
                  setQuantities({ ...quantities, ai: e.target.value })
                }
              />
              <p className="text-t3 text-sm w-[50px]">x 100</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              isLoading={buyLoading}
              onClick={async () => {
                setBuyLoading(true);
                setQuantities({
                  enrichment: parseInt(quantities.enrichment),
                  ai: parseInt(quantities.ai),
                });
                await buyStarter();
                setBuyLoading(false);
              }}
            >
              Buy
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader className="flex justify-between">
            <Button onClick={() => handleClicked("enrich")}>Enrich</Button>
            <Button onClick={() => handleClicked("ai")}>Use AI</Button>
          </CardHeader>
        </Card>
      </div>

      <div className="w-3/4 space-y-4">
        <APIPlayground
          title="Has Access"
          endpoint="GET /entitled"
          request={hasAccessRequest}
          response={hasAccessResponse}
          loading={hasAccessLoading}
        />

        <APIPlayground
          title="Send Event"
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
    <div className="border border-gray-700 flex flex-col gap-4 rounded p-4 bg-gray-900">
      <h3 className="font-bold text-white">{title}</h3>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Endpoint</p>
        <pre className="bg-gray-800 p-2 rounded text-sm text-gray-200">
          {endpoint}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Request</p>
        <pre className="bg-gray-800 p-2 rounded text-sm text-gray-200">
          {JSON.stringify(request, null, 2)}
        </pre>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">Response</p>
        <pre className="bg-gray-800 p-2 rounded text-sm text-gray-200">
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
