"use client";

import { useMemo, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { useCustomer } from "autumn-js/react";

export default function UseCustomerScenarioPage() {
  type UseCustomerParams = Parameters<typeof useCustomer>[0];

  const params = useMemo(
    (): NonNullable<UseCustomerParams> => ({
      errorOnNotFound: false,
      expand: ["invoices", "payment_method"],
    }),
    [],
  );

  const { customer, isLoading, error, refetch } = useCustomer(params);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Core / useCustomer
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          This page validates the default provider + autumnHandler path and
          surfaces request state for debugging.
        </p>
      </div>

      <DebugCard
        title="Hook State"
        description="Loading/error lifecycle for useCustomer"
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

      <div className="grid gap-4 lg:grid-cols-2">
        <DebugCard
          title="Hook Params"
          description="Exact params passed to useCustomer()"
        >
          <DataViewer
            title="useCustomer params"
            value={params}
            defaultExpandedDepth={3}
          />
        </DebugCard>
        <DebugCard
          title="Customer Payload"
          description="Latest customer object returned by autumn-js/react"
        >
          <DataViewer
            title="customer"
            value={customer}
            defaultExpandedDepth={2}
          />
        </DebugCard>
      </div>

      <DebugCard title="Error Payload" description="Error object (if any)">
        <DataViewer
          title="error"
          value={
            error
              ? { name: error.name, message: error.message, stack: error.stack }
              : null
          }
          defaultExpandedDepth={2}
        />
      </DebugCard>
    </div>
  );
}
