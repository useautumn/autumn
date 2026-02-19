"use client";

import { useCustomer } from "autumn-js/react";
import { useMemo, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";

export default function UseCustomerScenarioPage() {
  type UseCustomerParams = Parameters<typeof useCustomer>[0];

  const params = useMemo(
    (): NonNullable<UseCustomerParams> => ({
      errorOnNotFound: false,
      expand: ["invoices", "payment_method"],
    }),
    [],
  );

  const {
    data: customer,
    isLoading,
    error,
    refetch,
    attach,
    check,
  } = useCustomer(params);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
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

      <div className="grid gap-4 md:grid-cols-2">
        <DataViewer title="params" value={params} defaultExpandedDepth={3} />
        <DataViewer
          title="customer"
          value={customer}
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
