import { useNavigate, useSearchParams } from "react-router";
import { AppEnv, ErrCode, Feature, FeatureType } from "@autumn/shared";
import { useEffect, useRef, useState } from "react";
import { EventsBarChart } from "./AnalyticsGraph";
import { Card, CardContent } from "@/components/ui/card";
import { QueryTopbar } from "./components/QueryTopbar";
import { AnalyticsContext } from "./AnalyticsContext";
import {
  useAnalyticsData,
  useRawAnalyticsData,
} from "./hooks/useAnalyticsData";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { EventsAGGrid } from "./AnalyticsGraph";
import { cn } from "@/lib/utils";
import { colors } from "./components/AGGrid";
import PaginationPanel from "./components/PaginationPanel";
import { AgGridReact } from "ag-grid-react";

export const AnalyticsView = ({ env }: { env: AppEnv }) => {
  const [searchParams] = useSearchParams();
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [clickHouseDisabled, setClickHouseDisabled] = useState(false);
  const [hasCleared, setHasCleared] = useState(false);
  const [pageSize, setPageSize] = useState(500);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const gridRef = useRef<AgGridReact>(null);
  const navigate = useNavigate();

  const customerId = searchParams.get("customer_id");

  const {
    customer,
    features,
    events,
    queryLoading,
    error,
    bcExclusionFlag,
    topEventsLoading,
    topEvents,
  } = useAnalyticsData({ hasCleared });

  // console.log("Features: ", features);

  const { rawEvents, queryLoading: rawQueryLoading } = useRawAnalyticsData();

  const chartConfig = events?.meta
    .filter((x: any) => x.name != "period")
    .map((x: any, index: number) => {
      if (x.name != "period") {
        const colorIndex = index % colors.length;

        return {
          xKey: "period",
          yKey: x.name,
          type: "bar",
          stacked: true,
          yName:
            features.find((feature: Feature) => {
              const eventName = x.name.replace("_count", "");

              // console.log("Feature: ", feature, eventName);

              if (feature.type == FeatureType.Boolean) return false;

              if (feature.id === eventName) {
                return true;
              }

              if (feature.config.filters && feature.config.filters.length > 0) {
                return feature.config.filters.some(
                  (filter: any) =>
                    filter.value &&
                    Array.isArray(filter.value) &&
                    filter.value.includes(eventName)
                );
              }
              return false;
            })?.name || x.name.replace("_count", ""),
          fill: colors[colorIndex],
        };
      }
    });

  useEffect(() => {
    if (error) {
      if (
        error.response &&
        error.response.data &&
        error.response.data.code === ErrCode.ClickHouseDisabled
      ) {
        setClickHouseDisabled(true);
      }
    }
  }, [error]);

  if (clickHouseDisabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h3 className="text-sm text-t2 font-bold">ClickHouse is disabled</h3>
      </div>
    );
  }

  return (
    <AnalyticsContext.Provider
      value={{
        customer,
        eventNames,
        selectedInterval: searchParams.get("interval") || "30d",
        setSelectedInterval: (interval: string) => {
          const newParams = new URLSearchParams(searchParams);
          newParams.set("interval", interval);
          navigate(`${location.pathname}?${newParams.toString()}`);
        },

        setEventNames,
        featureIds,
        setFeatureIds,
        features,
        bcExclusionFlag,
        hasCleared,
        setHasCleared,
        gridRef,
        pageSize,
        setPageSize,
        currentPage,
        setCurrentPage,
        totalPages,
        setTotalPages,
        totalRows,
        setTotalRows,
        topEvents,
      }}
    >
      <div className="flex flex-col gap-4 h-full relative w-full text-sm pb-0 overflow-hidden">
        <h1
          className={cn(
            "text-xl font-medium shrink-0 pl-10",
            env === AppEnv.Sandbox ? "pt-4" : "pt-6"
          )}
        >
          Analytics
        </h1>
        <div className="max-h-[400px] min-h-[400px] pb-6">
          <PageSectionHeader
            title="Usage Analytics"
            endContent={<QueryTopbar />}
            className="h-10"
          />
          {(queryLoading || topEventsLoading) && (
            <div className="flex-1 px-10 pt-6">
              <p className="text-t3 text-sm shimmer w-fit">
                Fetching usage {customerId ? `for ${customerId}` : ""}
              </p>
            </div>
          )}

          <div className="h-full">
            {events && events.data.length > 0 && (
              <Card className="h-full p-0 pt-6 w-full bg-transparent border-none rounded-none shadow-none">
                <CardContent className="px-6 h-full bg-transparent">
                  <EventsBarChart data={events} chartConfig={chartConfig} />
                </CardContent>
              </Card>
            )}

            {!events && !queryLoading && (
              <div className="flex-1 px-10 pt-6">
                <p className="text-t3 text-sm">
                  No events found. Please widen your filters.{" "}
                  {eventNames.length === 0
                    ? "Try to select some events in the dropdown above."
                    : ""}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="h-full">
          <PageSectionHeader
            title="Event Logs"
            className="h-10"
            endContent={<PaginationPanel />}
          />

          {rawQueryLoading && (
            <div className="flex-1 px-10 pt-6">
              <p className="text-t3 text-sm shimmer w-fit">
                Fetching raw events {customerId ? `for ${customerId}` : ""}
              </p>
            </div>
          )}

          {rawEvents && !rawQueryLoading && (
            <Card className="w-full h-full bg-stone-50 border-none rounded-none shadow-none py-0 pb-10">
              <CardContent className="p-0 h-full bg-transparent overflow-hidden">
                <EventsAGGrid data={rawEvents} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AnalyticsContext.Provider>
  );
};
