"use client";

import type {
  ClientAttachParams,
  ClientMultiAttachParams,
  ClientOpenCustomerPortalParams,
  ClientSetupPaymentParams,
} from "autumn-js/react";
import { useCustomer, useListPlans } from "autumn-js/react";
import { useId, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionTab =
  | "attach"
  | "multiAttach"
  | "check"
  | "setupPayment"
  | "openCustomerPortal";

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

export default function UseAutumnScenarioPage() {
  const customerResult = useCustomer({
    errorOnNotFound: false,
  });
  const {
    isLoading,
    error,
    refetch,
    attach,
    multiAttach,
    check,
    setupPayment,
    openCustomerPortal,
  } = customerResult;

  const plansResult = useListPlans();

  const [showDebugData, setShowDebugData] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastAction, setLastAction] = useState<LastActionState>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<ActionTab>("attach");

  // Input state
  const [planId, setPlanId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [requiredBalance, setRequiredBalance] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(false);
  const [portalReturnUrl, setPortalReturnUrl] = useState("");
  const [multiAttachPlanIds, setMultiAttachPlanIds] = useState("");
  const [setupPaymentSuccessUrl, setSetupPaymentSuccessUrl] = useState("");
  const [setupPaymentPlanId, setSetupPaymentPlanId] = useState("");
  const [checkoutSessionParams, setCheckoutSessionParams] = useState(
    '{\n  "billing_address_collection": "required"\n}',
  );

  // Form element IDs
  const planIdInputId = useId();
  const featureIdInputId = useId();
  const requiredBalanceInputId = useId();
  const portalReturnUrlInputId = useId();
  const multiAttachPlanIdsInputId = useId();
  const setupPaymentSuccessUrlInputId = useId();
  const setupPaymentPlanIdInputId = useId();
  const checkoutSessionParamsInputId = useId();

  const parseOptionalJson = ({
    value,
    label,
  }: {
    value: string;
    label: string;
  }) => {
    if (!value.trim()) {
      return undefined;
    }

    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
  };

  const runAction = async ({
    name,
    params,
    execute,
  }: {
    name: string;
    params: unknown;
    execute: () => Promise<unknown> | unknown;
  }) => {
    setIsRunning(true);
    try {
      const result = await Promise.resolve(execute());
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

  const handleAttach = () => {
    if (!planId) return;

    let params: ClientAttachParams;

    try {
      params = {
        planId,
        openInNewTab,
        newBillingSubscription: true,
        checkoutSessionParams: parseOptionalJson({
          value: checkoutSessionParams,
          label: "Checkout session params",
        }),
      };
    } catch (err) {
      setLastAction({
        name: "attach",
        params: {
          planId,
          openInNewTab,
          newBillingSubscription: true,
          checkoutSessionParams,
        },
        result: null,
        error: toErrorPayload({ error: err }),
        executedAt: new Date().toISOString(),
      });
      return;
    }

    runAction({
      name: "attach",
      params,
      execute: () => attach(params),
    });
  };

  const handleCheck = () => {
    if (!featureId) return;
    const params = {
      featureId,
      requiredBalance: requiredBalance
        ? parseFloat(requiredBalance)
        : undefined,
    };
    runAction({
      name: "check",
      params,
      execute: () => check(params),
    });
  };

  const handleMultiAttach = () => {
    if (!multiAttachPlanIds) return;
    const plans = multiAttachPlanIds
      .split(",")
      .map((id) => ({ planId: id.trim() }));
    const params: ClientMultiAttachParams = {
      plans,
      openInNewTab,
    };
    runAction({
      name: "multiAttach",
      params,
      execute: () => multiAttach(params),
    });
  };

  const handleSetupPayment = () => {
    const params: ClientSetupPaymentParams = {
      planId: setupPaymentPlanId || undefined,
      successUrl: setupPaymentSuccessUrl || undefined,
      openInNewTab,
    };
    runAction({
      name: "setupPayment",
      params,
      execute: () => setupPayment(params),
    });
  };

  const handleOpenCustomerPortal = () => {
    const params: ClientOpenCustomerPortalParams = {
      returnUrl: portalReturnUrl || undefined,
      openInNewTab,
    };
    runAction({
      name: "openCustomerPortal",
      params,
      execute: () => openCustomerPortal(params),
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
          isLoading={isLoading}
          error={error}
          lastUpdatedAt={lastUpdatedAt}
        />
      </DebugCard>

      <DebugCard title="Actions">
        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActiveTab("attach")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "attach"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Attach
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("multiAttach")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "multiAttach"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Multi Attach
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("check")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "check"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Check
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("setupPayment")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "setupPayment"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Setup Payment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("openCustomerPortal")}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "openCustomerPortal"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Portal
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "attach" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={planIdInputId} className="text-xs text-zinc-500">
                Plan ID
              </Label>
              <Input
                id={planIdInputId}
                placeholder="Enter plan ID"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Open in new tab
            </label>
            <div className="space-y-1.5">
              <Label
                htmlFor={checkoutSessionParamsInputId}
                className="text-xs text-zinc-500"
              >
                Checkout Session Params JSON (optional)
              </Label>
              <textarea
                id={checkoutSessionParamsInputId}
                placeholder='{"billing_address_collection":"required"}'
                value={checkoutSessionParams}
                onChange={(e) => setCheckoutSessionParams(e.target.value)}
                className="min-h-28 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none transition focus:border-zinc-400 focus:ring-0"
              />
              <p className="text-[11px] leading-tight text-zinc-500">
                Passed through to Stripe checkout session creation.
              </p>
            </div>
            <Button
              size="sm"
              disabled={isRunning || !planId}
              onClick={handleAttach}
            >
              {isRunning ? "Running..." : "Attach"}
            </Button>
          </div>
        )}

        {activeTab === "check" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={featureIdInputId}
                className="text-xs text-zinc-500"
              >
                Feature ID
              </Label>
              <Input
                id={featureIdInputId}
                placeholder="Enter feature ID"
                value={featureId}
                onChange={(e) => setFeatureId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={requiredBalanceInputId}
                className="text-xs text-zinc-500"
              >
                Required Balance (optional)
              </Label>
              <Input
                id={requiredBalanceInputId}
                type="number"
                placeholder="Enter required balance"
                value={requiredBalance}
                onChange={(e) => setRequiredBalance(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={isRunning || !featureId}
              onClick={handleCheck}
            >
              {isRunning ? "Running..." : "Check"}
            </Button>
          </div>
        )}

        {activeTab === "multiAttach" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={multiAttachPlanIdsInputId}
                className="text-xs text-zinc-500"
              >
                Plan IDs (comma-separated)
              </Label>
              <Input
                id={multiAttachPlanIdsInputId}
                placeholder="pro_plan, addon_seats"
                value={multiAttachPlanIds}
                onChange={(e) => setMultiAttachPlanIds(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Open in new tab
            </label>
            <Button
              size="sm"
              disabled={isRunning || !multiAttachPlanIds}
              onClick={handleMultiAttach}
            >
              {isRunning ? "Running..." : "Multi Attach"}
            </Button>
          </div>
        )}

        {activeTab === "setupPayment" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={setupPaymentPlanIdInputId}
                className="text-xs text-zinc-500"
              >
                Plan ID (optional)
              </Label>
              <Input
                id={setupPaymentPlanIdInputId}
                placeholder="Attach plan after setup"
                value={setupPaymentPlanId}
                onChange={(e) => setSetupPaymentPlanId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={setupPaymentSuccessUrlInputId}
                className="text-xs text-zinc-500"
              >
                Success URL (optional)
              </Label>
              <Input
                id={setupPaymentSuccessUrlInputId}
                placeholder="https://app.example.com/billing"
                value={setupPaymentSuccessUrl}
                onChange={(e) => setSetupPaymentSuccessUrl(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] leading-tight text-zinc-500">
                Defaults to the current page URL when left empty.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Open in new tab
            </label>
            <Button size="sm" disabled={isRunning} onClick={handleSetupPayment}>
              {isRunning ? "Running..." : "Setup Payment"}
            </Button>
          </div>
        )}

        {activeTab === "openCustomerPortal" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor={portalReturnUrlInputId}
                className="text-xs text-zinc-500"
              >
                Return URL (optional)
              </Label>
              <Input
                id={portalReturnUrlInputId}
                placeholder="https://app.example.com/settings/billing"
                value={portalReturnUrl}
                onChange={(e) => setPortalReturnUrl(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] leading-tight text-zinc-500">
                Defaults to the current page URL when left empty.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={openInNewTab}
                onChange={(e) => setOpenInNewTab(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Open in new tab
            </label>
            <Button
              size="sm"
              disabled={isRunning}
              onClick={handleOpenCustomerPortal}
            >
              {isRunning ? "Running..." : "Open portal"}
            </Button>
          </div>
        )}
      </DebugCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer
          title="Last Action Request"
          value={
            lastAction
              ? {
                  name: lastAction.name,
                  executedAt: lastAction.executedAt,
                  params: lastAction.params,
                }
              : null
          }
          defaultExpandedDepth={3}
        />
        <DataViewer
          title="Last Action Result"
          value={lastAction?.result ?? null}
          defaultExpandedDepth={3}
        />
      </div>

      <DataViewer
        title="Last Action Error"
        value={lastAction?.error ?? null}
        defaultExpandedDepth={3}
      />

      <DebugCard
        title="Hook Data"
        actions={
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={showDebugData}
              onChange={(e) => setShowDebugData(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Show
          </label>
        }
      >
        {showDebugData && (
          <div className="grid gap-4 lg:grid-cols-2">
            <DataViewer
              title="useCustomer"
              value={customerResult.data ?? null}
              defaultExpandedDepth={2}
            />
            <DataViewer
              title="useListPlans"
              value={plansResult.data ?? null}
              defaultExpandedDepth={2}
            />
          </div>
        )}
      </DebugCard>
    </div>
  );
}
