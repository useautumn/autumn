"use client";

import type { ClientRedeemReferralCodeParams } from "autumn-js/react";
import { useReferrals } from "autumn-js/react";
import { useId, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionTab = "createReferralCode" | "redeemReferralCode";

type LastActionState = {
  name: string;
  params: unknown;
  result: unknown;
  error: unknown;
  executedAt: string;
} | null;

const toErrorPayload = ({ error }: { error: unknown }) => {
  if (error instanceof Error) {
    const typed = error as Error & {
      code?: string;
      statusCode?: number;
      details?: unknown;
    };

    return {
      message: typed.message,
      code: typed.code ?? null,
      statusCode: typed.statusCode ?? null,
      details: typed.details ?? null,
      name: typed.name,
    };
  }

  return {
    message: "Unknown error",
    raw: error,
  };
};

export default function UseReferralsScenarioPage() {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastAction, setLastAction] = useState<LastActionState>(null);
  const [activeTab, setActiveTab] = useState<ActionTab>("createReferralCode");

  const [programId, setProgramId] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const { data, isLoading, isFetching, error, refetch, redeemCode } =
    useReferrals({
      programId,
    });

  const programIdInputId = useId();
  const referralCodeInputId = useId();

  const runAction = async ({
    name,
    params,
    execute,
  }: {
    name: string;
    params: unknown;
    execute: () => Promise<unknown>;
  }) => {
    setIsRunning(true);
    try {
      const result = await execute();
      setLastAction({
        name,
        params,
        result,
        error: null,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      setLastAction({
        name,
        params,
        result: null,
        error: toErrorPayload({ error: err }),
        executedAt: new Date().toISOString(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const onRefetch = async () => {
    await refetch();
    setLastUpdatedAt(new Date().toISOString());
  };

  const handleCreateReferralCode = () => {
    if (!programId) return;

    runAction({
      name: "createReferralCode",
      params: { programId },
      execute: async () => {
        const result = await refetch();
        if (result.error) {
          throw result.error;
        }
        return result.data ?? null;
      },
    });
  };

  const handleRedeemReferralCode = () => {
    if (!referralCode) return;

    const params: ClientRedeemReferralCodeParams = {
      code: referralCode,
    };

    runAction({
      name: "redeemReferralCode",
      params,
      execute: () => redeemCode(params),
    });
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
          isLoading={isLoading || isFetching}
          error={error}
          lastUpdatedAt={lastUpdatedAt}
        />
      </DebugCard>

      <DebugCard title="Referral Actions">
        <div className="mb-4 flex gap-1 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab("createReferralCode")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "createReferralCode"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Create Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("redeemReferralCode")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "redeemReferralCode"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Redeem Code
          </button>
        </div>

        {activeTab === "createReferralCode" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={programIdInputId}
                className="text-xs text-zinc-500"
              >
                Program ID
              </Label>
              <Input
                id={programIdInputId}
                placeholder="prog_123"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={isRunning || !programId}
              onClick={handleCreateReferralCode}
            >
              {isRunning ? "Running..." : "Create code"}
            </Button>
          </div>
        )}

        {activeTab === "redeemReferralCode" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={referralCodeInputId}
                className="text-xs text-zinc-500"
              >
                Referral Code
              </Label>
              <Input
                id={referralCodeInputId}
                placeholder="REF123ABC"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={isRunning || !referralCode}
              onClick={handleRedeemReferralCode}
            >
              {isRunning ? "Running..." : "Redeem code"}
            </Button>
          </div>
        )}
      </DebugCard>

      <div className="grid gap-4 md:grid-cols-2">
        <DataViewer
          title="createReferralCode.data"
          value={data ?? null}
          defaultExpandedDepth={3}
        />
        <DataViewer
          title="lastAction"
          value={lastAction}
          defaultExpandedDepth={3}
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
            : (lastAction?.error ?? null)
        }
        defaultExpandedDepth={2}
      />
    </div>
  );
}
