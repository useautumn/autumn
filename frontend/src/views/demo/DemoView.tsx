"use client";

import { useState } from "react";
import axios from "axios";
import SmallSpinner from "@/components/general/SmallSpinner";
import { CustomToaster } from "@/components/general/CustomToaster";
import toast from "react-hot-toast";

export default function DemoView() {
  const hasAccessRequest = {
    feature_id: "scrape",
    customer_id: "123",
  };

  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);

  const scrapeRequest = {
    event_name: "scrape",
    customer_id: "123",
    properties: {},
  };

  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResponse, setScrapeResponse] = useState(null);

  const apiKey = "am_live_3ZjuppssW1Q5C4Dn5CWmH6Uy";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  const customerId = "123";
  const featureId = "scrape";
  const eventName = "scrape";
  const checkAccessUrl = `http://localhost:8080/v1/entitlements/is_allowed?customer_id=${customerId}&feature_id=${featureId}`;
  const sendUsageUrl = "http://localhost:8080/v1/events";





  const checkAccess = async () => {
    const { data } = await axios.get(checkAccessUrl, {
      headers,
    });

    if (!data.allowed) {
      toast.error("You're out of credits.");
    }
    return data;
  };



  const sendUsage = async () => {
    const { data } = await axios.post(sendUsageUrl, {
      event_name: eventName,
      customer_id: customerId,
    }, {
      headers,
    });

    toast.success("Scrape successful");
    return data;
  };







  const handleClicked = async () => {
    setHasAccessLoading(true);
    const data = await checkAccess();
    setHasAccessLoading(false);
    setHasAccessResponse(data);

    if (!data.allowed) {
      return;
    }

    setScrapeLoading(true);
    const scrapeData = await sendUsage();
    setScrapeResponse(scrapeData);
    setScrapeLoading(false);

  };

  return (
    <div className="flex gap-4 p-4">
      <CustomToaster />
      <div className="w-1/4">
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleClicked}
        >
          Scrape
        </button>
      </div>

      <div className="w-3/4 space-y-4">
        <APIPlayground
          title="Has Access"
          endpoint="GET /entitlements/is_allowed"
          request={hasAccessRequest}
          response={hasAccessResponse}
          loading={hasAccessLoading}
        />

        <APIPlayground
          title="Scrape"
          endpoint="POST /events"
          request={scrapeRequest}
          response={scrapeResponse}
          loading={scrapeLoading}
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
