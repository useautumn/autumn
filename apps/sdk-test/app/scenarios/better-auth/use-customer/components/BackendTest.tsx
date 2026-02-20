"use client";

import { useState } from "react";
import { DebugCard } from "@/components/debug/DebugCard";
import { Button } from "@/components/ui/button";

export function BackendTest({
  onResult,
  onError,
}: {
  onResult: (data: unknown) => void;
  onError: (error: unknown) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const testBackendCustomer = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/test-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expand: ["invoices", "payment_method"] }),
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data);
      } else {
        onResult(data);
      }
    } catch (err) {
      onError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DebugCard
      title="Backend: auth.api.getOrCreateCustomer"
      actions={
        <Button variant="outline" size="sm" onClick={testBackendCustomer}>
          {isLoading ? "Loading..." : "Test"}
        </Button>
      }
    >
      <p className="text-sm text-zinc-500">
        Calls{" "}
        <code className="text-xs bg-zinc-100 px-1 py-0.5 rounded">
          auth.api.getOrCreateCustomer
        </code>{" "}
        on the server
      </p>
    </DebugCard>
  );
}
