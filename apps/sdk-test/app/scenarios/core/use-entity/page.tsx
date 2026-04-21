"use client";

import { useEntity } from "autumn-js/react";
import { useId, useMemo, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UseEntityScenarioPage() {
  const entityIdInputId = useId();
  const [entityId, setEntityId] = useState("test-entity");
  const [submittedEntityId, setSubmittedEntityId] = useState("test-entity");

  const params = useMemo(
    () => ({ entityId: submittedEntityId }),
    [submittedEntityId],
  );

  const { data: entity, isLoading, error, refetch } = useEntity(params);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  const onSubmit = () => {
    setSubmittedEntityId(entityId);
  };

  return (
    <div className="space-y-4">
      <DebugCard title="Entity Lookup">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={entityIdInputId}>Entity ID</Label>
            <Input
              id={entityIdInputId}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g. seat_42"
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            />
          </div>
          <Button variant="outline" size="sm" onClick={onSubmit}>
            Fetch
          </Button>
        </div>
      </DebugCard>

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
        <DataViewer title="entity" value={entity} defaultExpandedDepth={2} />
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
