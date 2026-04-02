"use client";

import { AutumnProvider, useAutumnClient, useCustomer } from "autumn-js/react";
import { useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";

function HeadersTestInner({
  customHeaders,
}: {
  customHeaders: Record<string, string>;
}) {
  const { data: customer, isLoading, error, refetch } = useCustomer();
  const [echoResult, setEchoResult] = useState<unknown>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  const onTestEcho = async () => {
    const response = await fetch("/api/headers-test/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    const data = await response.json();
    setEchoResult(data);
  };

  return (
    <div className="space-y-4">
      <DebugCard
        title="Hook State"
        actions={
          <Button variant="outline" size="sm" onClick={onRefetch}>
            Refetch
          </Button>
        }
      >
        <HookStatePanel
          isLoading={isLoading}
          error={error}
          lastUpdatedAt={lastUpdatedAt}
        />
      </DebugCard>

      <DebugCard
        title="Echo Test"
        description="Sends a request to the echo endpoint and displays the headers received by the backend."
        actions={
          <Button variant="outline" size="sm" onClick={onTestEcho}>
            Send Echo
          </Button>
        }
      >
        <div className="text-xs text-zinc-500">
          Headers configured on this AutumnProvider:
          <pre className="mt-1 font-mono">
            {JSON.stringify(customHeaders, null, 2)}
          </pre>
        </div>
      </DebugCard>

      <div className="grid gap-4 md:grid-cols-2">
        <DataViewer
          title="customer"
          value={customer ?? null}
          defaultExpandedDepth={2}
        />
        <DataViewer
          title="echo response"
          value={echoResult}
          defaultExpandedDepth={2}
        />
      </div>

      <DataViewer
        title="error"
        value={
          error
            ? {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode,
              }
            : null
        }
        defaultExpandedDepth={2}
      />
    </div>
  );
}

const CUSTOM_HEADERS = {
  "x-custom-test-header": "my-custom-value",
};

export default function HeadersTestPage() {
  return (
    <AutumnProvider pathPrefix="/api/headers-test" headers={CUSTOM_HEADERS}>
      <HeadersTestInner customHeaders={CUSTOM_HEADERS} />
    </AutumnProvider>
  );
}
