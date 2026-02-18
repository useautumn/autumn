"use client";

import { useListPlans } from "autumn-js/react";
import { useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";

export default function UseListPlansScenarioPage() {
  const { data: plans, isLoading, error, refetch } = useListPlans();
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

      <DataViewer title="plans" value={plans} defaultExpandedDepth={2} />

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
