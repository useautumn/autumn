"use client";

import { useCustomer } from "autumn-js/react";
import { useMemo, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { AuthControls, BackendTest, OrgControls } from "./components";

export default function BetterAuthUseCustomerPage() {
  const { data: session } = useSession();
  const activeOrg = authClient.useActiveOrganization();

  // Shared error state
  const [error, setError] = useState<unknown>(null);

  // Backend test state
  const [backendCustomer, setBackendCustomer] = useState<unknown>(null);

  // useCustomer hook
  const params = useMemo(
    () => ({
      errorOnNotFound: false,
      expand: ["invoices", "payment_method"] as (
        | "invoices"
        | "payment_method"
      )[],
    }),
    [],
  );
  const {
    data: hookCustomer,
    isLoading: hookLoading,
    error: hookError,
    refetch,
  } = useCustomer(params);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  const handleSignOut = () => {
    setBackendCustomer(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Auth & Org Controls Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AuthControls onError={setError} onSignOut={handleSignOut} />
        {session && <OrgControls onError={setError} />}
      </div>

      {/* Backend Test & Hook State Row */}
      {session && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BackendTest onResult={setBackendCustomer} onError={setError} />
          <DebugCard
            title="Hook: useCustomer"
            actions={
              <Button variant="outline" size="sm" onClick={onRefetch}>
                Refetch
              </Button>
            }
          >
            <HookStatePanel
              isLoading={hookLoading}
              error={hookError}
              lastUpdatedAt={lastUpdatedAt}
            />
          </DebugCard>
        </div>
      )}

      {/* Data Viewers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer
          title="Backend Customer (auth.api)"
          value={backendCustomer}
          defaultExpandedDepth={2}
        />
        <DataViewer
          title="Hook Customer (useCustomer)"
          value={hookCustomer}
          defaultExpandedDepth={2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer title="Session" value={session} defaultExpandedDepth={2} />
        <DataViewer
          title="Active Organization"
          value={activeOrg.data}
          defaultExpandedDepth={2}
        />
      </div>

      {(error || hookError) && (
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
      )}
    </div>
  );
}
