"use client";

import { useAggregateEvents, useListEvents } from "autumn-js/react";
import { useId, useState } from "react";
import { DataViewer } from "@/components/debug/DataViewer";
import { DebugCard } from "@/components/debug/DebugCard";
import { HookStatePanel } from "@/components/debug/HookStatePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UseEventsScenarioPage() {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [eventsFeatureId, setEventsFeatureId] = useState("");
  const [eventsLimit, setEventsLimit] = useState("25");
  const [eventsStart, setEventsStart] = useState("");
  const [eventsEnd, setEventsEnd] = useState("");
  const [eventsPageInput, setEventsPageInput] = useState("1");

  const [aggregateFeatureId, setAggregateFeatureId] = useState("");
  const [aggregateRange, setAggregateRange] = useState("7d");
  const [aggregateBinSize, setAggregateBinSize] = useState("day");
  const [aggregateGroupBy, setAggregateGroupBy] = useState("");
  const [aggregateStart, setAggregateStart] = useState("");
  const [aggregateEnd, setAggregateEnd] = useState("");

  const eventsFeatureIdInputId = useId();
  const eventsLimitInputId = useId();
  const eventsStartInputId = useId();
  const eventsEndInputId = useId();
  const eventsPageInputId = useId();
  const aggregateFeatureIdInputId = useId();
  const aggregateRangeInputId = useId();
  const aggregateBinSizeInputId = useId();
  const aggregateGroupByInputId = useId();
  const aggregateStartInputId = useId();
  const aggregateEndInputId = useId();

  const parsedEventsLimit = eventsLimit ? parseInt(eventsLimit, 10) : undefined;
  const safeEventsLimit =
    Number.isFinite(parsedEventsLimit) && parsedEventsLimit !== undefined
      ? parsedEventsLimit
      : 25;

  const listEvents = useListEvents({
    featureId: eventsFeatureId || undefined,
    limit: safeEventsLimit,
    customRange:
      eventsStart || eventsEnd
        ? {
            start: eventsStart ? parseInt(eventsStart, 10) : undefined,
            end: eventsEnd ? parseInt(eventsEnd, 10) : undefined,
          }
        : undefined,
  });

  const aggregateEvents = useAggregateEvents({
    featureId: aggregateFeatureId,
    range: aggregateRange || undefined,
    binSize: aggregateBinSize || undefined,
    groupBy: aggregateGroupBy || undefined,
    customRange:
      aggregateStart && aggregateEnd
        ? {
            start: parseInt(aggregateStart, 10),
            end: parseInt(aggregateEnd, 10),
          }
        : undefined,
    queryOptions: {
      enabled: !!aggregateFeatureId,
    },
  });

  const onRefreshBoth = async () => {
    await Promise.all([listEvents.refetch(), aggregateEvents.refetch()]);
    setLastUpdatedAt(new Date().toISOString());
  };

  return (
    <div className="space-y-4">
      <DebugCard
        title="Hooks State"
        actions={
          <Button variant="outline" size="sm" onClick={onRefreshBoth}>
            Refresh both
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <HookStatePanel
            isLoading={listEvents.isLoading}
            error={listEvents.error}
            lastUpdatedAt={lastUpdatedAt}
          />
          <HookStatePanel
            isLoading={aggregateEvents.isLoading}
            error={aggregateEvents.error}
            lastUpdatedAt={lastUpdatedAt}
          />
        </div>
      </DebugCard>

      <DebugCard title="List Events">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor={eventsFeatureIdInputId}
                className="text-xs text-zinc-500"
              >
                Feature ID (optional)
              </Label>
              <Input
                id={eventsFeatureIdInputId}
                placeholder="api_calls"
                value={eventsFeatureId}
                onChange={(e) => setEventsFeatureId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={eventsLimitInputId}
                className="text-xs text-zinc-500"
              >
                Limit
              </Label>
              <Input
                id={eventsLimitInputId}
                type="number"
                min={1}
                max={1000}
                value={eventsLimit}
                onChange={(e) => setEventsLimit(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={eventsStartInputId}
                className="text-xs text-zinc-500"
              >
                Range Start (epoch ms)
              </Label>
              <Input
                id={eventsStartInputId}
                type="number"
                placeholder="1704067200000"
                value={eventsStart}
                onChange={(e) => setEventsStart(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={eventsEndInputId}
                className="text-xs text-zinc-500"
              >
                Range End (epoch ms)
              </Label>
              <Input
                id={eventsEndInputId}
                type="number"
                placeholder="1706745600000"
                value={eventsEnd}
                onChange={(e) => setEventsEnd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => listEvents.refetch()}
              disabled={listEvents.isFetching}
            >
              {listEvents.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={listEvents.prevPage}
              disabled={!listEvents.hasPrevious || listEvents.isFetching}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={listEvents.nextPage}
              disabled={!listEvents.hasMore || listEvents.isFetching}
            >
              Next
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={listEvents.resetPagination}
              disabled={listEvents.page === 0 || listEvents.isFetching}
            >
              Reset Page
            </Button>
            <div className="flex items-center gap-1">
              <Label
                htmlFor={eventsPageInputId}
                className="text-xs text-zinc-500"
              >
                Go to
              </Label>
              <Input
                id={eventsPageInputId}
                type="number"
                min={1}
                value={eventsPageInput}
                onChange={(e) => setEventsPageInput(e.target.value)}
                className="h-8 w-20 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  listEvents.goToPage({
                    pageNum: Math.max(
                      0,
                      (parseInt(eventsPageInput, 10) || 1) - 1,
                    ),
                  })
                }
                disabled={listEvents.isFetching}
              >
                Go
              </Button>
            </div>
            <span className="text-xs text-zinc-500">
              Page {listEvents.page + 1} • Offset{" "}
              {(listEvents.data?.offset ?? 0).toString()} • Has more:{" "}
              {listEvents.hasMore ? "yes" : "no"}
            </span>
          </div>
        </div>
      </DebugCard>

      <DebugCard title="Aggregate Events">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateFeatureIdInputId}
                className="text-xs text-zinc-500"
              >
                Feature ID
              </Label>
              <Input
                id={aggregateFeatureIdInputId}
                placeholder="api_calls"
                value={aggregateFeatureId}
                onChange={(e) => setAggregateFeatureId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateRangeInputId}
                className="text-xs text-zinc-500"
              >
                Range
              </Label>
              <Input
                id={aggregateRangeInputId}
                placeholder="7d | 30d | 24h"
                value={aggregateRange}
                onChange={(e) => setAggregateRange(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateBinSizeInputId}
                className="text-xs text-zinc-500"
              >
                Bin Size
              </Label>
              <Input
                id={aggregateBinSizeInputId}
                placeholder="day | hour | month"
                value={aggregateBinSize}
                onChange={(e) => setAggregateBinSize(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateGroupByInputId}
                className="text-xs text-zinc-500"
              >
                Group By (optional)
              </Label>
              <Input
                id={aggregateGroupByInputId}
                placeholder="properties.model"
                value={aggregateGroupBy}
                onChange={(e) => setAggregateGroupBy(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateStartInputId}
                className="text-xs text-zinc-500"
              >
                Custom Start (epoch ms)
              </Label>
              <Input
                id={aggregateStartInputId}
                type="number"
                placeholder="1704067200000"
                value={aggregateStart}
                onChange={(e) => setAggregateStart(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor={aggregateEndInputId}
                className="text-xs text-zinc-500"
              >
                Custom End (epoch ms)
              </Label>
              <Input
                id={aggregateEndInputId}
                type="number"
                placeholder="1706745600000"
                value={aggregateEnd}
                onChange={(e) => setAggregateEnd(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => aggregateEvents.refetch()}
              disabled={!aggregateFeatureId || aggregateEvents.isFetching}
            >
              {aggregateEvents.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <span className="text-xs text-zinc-500">
              {aggregateFeatureId
                ? "Runs with current params"
                : "Feature ID required"}
            </span>
          </div>
        </div>
      </DebugCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer
          title="List Events Result"
          value={listEvents.data ?? null}
          defaultExpandedDepth={2}
        />
        <DataViewer
          title="Aggregate Events Result"
          value={aggregateEvents.data ?? null}
          defaultExpandedDepth={2}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataViewer
          title="List Events Error"
          value={
            listEvents.error
              ? {
                  message: listEvents.error.message,
                  code: listEvents.error.code,
                  statusCode: listEvents.error.statusCode,
                }
              : null
          }
          defaultExpandedDepth={2}
        />
        <DataViewer
          title="Aggregate Events Error"
          value={
            aggregateEvents.error
              ? {
                  message: aggregateEvents.error.message,
                  code: aggregateEvents.error.code,
                  statusCode: aggregateEvents.error.statusCode,
                }
              : null
          }
          defaultExpandedDepth={2}
        />
      </div>
    </div>
  );
}
