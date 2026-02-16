"use client";

import { usePricingTable } from "autumn-js/react";
import { useMemo, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";

export default function UsePricingTableScenarioPage() {
  type UsePricingTableParams = Parameters<typeof usePricingTable>[0];

  const params = useMemo(
    (): NonNullable<UsePricingTableParams> => ({
      productDetails: undefined,
    }),
    [],
  );

  const { products, isLoading, error, refetch } = usePricingTable(params);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Core / usePricingTable
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          This page validates the usePricingTable hook which fetches and merges
          product data for pricing table display.
        </p>
      </div>

      <DebugCard
        title="Hook State"
        description="Loading/error lifecycle for usePricingTable"
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
          description="Exact params passed to usePricingTable()"
        >
          <DataViewer
            title="usePricingTable params"
            value={params}
            defaultExpandedDepth={3}
          />
        </DebugCard>
        <DebugCard
          title="Products Payload"
          description="Merged products array returned by autumn-js/react"
        >
          <DataViewer
            title="products"
            value={products}
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
