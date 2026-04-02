"use client";

import { AutumnProvider, useCustomer } from "autumn-js/react";
import { useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";

const CUSTOM_HEADERS = {
  "x-custom-test-header": "my-custom-value",
};

function HeadersTestInner() {
  const { data: customer, isLoading, error, refetch } = useCustomer();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  return (
    <div className="space-y-4">
      <DebugCard
        title="Hook State"
        description={`AutumnProvider configured with headers: ${JSON.stringify(CUSTOM_HEADERS)}`}
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

      <DataViewer
        title="customer"
        value={customer ?? null}
        defaultExpandedDepth={2}
      />

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

export default function HeadersTestPage() {
  return (
    <AutumnProvider pathPrefix="/api/headers-test" headers={CUSTOM_HEADERS}>
      <HeadersTestInner />
    </AutumnProvider>
  );
}
