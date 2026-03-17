"use client";

import { useListPlans } from "autumn-js/react";
import { useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { AuthControls, OrgControls } from "../use-customer/components";

export default function BetterAuthUseListPlansPage() {
  const { data: session } = useSession();
  const activeOrg = authClient.useActiveOrganization();
  const [error, setError] = useState<unknown>(null);
  const { data: plans, isLoading, error: hookError, refetch } = useListPlans();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  const handleSignOut = () => {
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <AuthControls onError={setError} onSignOut={handleSignOut} />
        {session && <OrgControls onError={setError} />}
      </div>

      <DebugCard
        title="Hook: useListPlans"
        actions={
          <Button variant="outline" size="sm" onClick={onRefetch}>
            Refetch
          </Button>
        }
      >
        <HookStatePanel
          isLoading={isLoading}
          error={hookError}
          lastUpdatedAt={lastUpdatedAt}
        />
      </DebugCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer title="Plans" value={plans} defaultExpandedDepth={2} />
        <DataViewer title="Session" value={session} defaultExpandedDepth={2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer
          title="Active Organization"
          value={activeOrg.data}
          defaultExpandedDepth={2}
        />
        <DataViewer
          title="Error"
          value={
            error ||
            (hookError
              ? {
                  message: hookError.message,
                  code: hookError.code,
                  statusCode: hookError.statusCode,
                }
              : null)
          }
          defaultExpandedDepth={2}
        />
      </div>
    </div>
  );
}
