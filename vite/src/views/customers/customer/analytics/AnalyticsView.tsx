import { useNavigate, useParams, useSearchParams } from "react-router";
import { AppEnv, ErrCode } from "@autumn/shared";
import { CustomerBreadcrumbs } from "../customer-breadcrumbs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { navigateTo } from "@/utils/genUtils";
import { useEffect, useState } from "react";
import { CusService } from "@/services/customers/CusService";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { OrgService } from "@/services/OrgService";
import { toast } from "sonner";
import { EventsBarChart } from "./AnalyticsGraph";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { QueryTopbar } from "./components/QueryTopbar";
import { AnalyticsContext } from "./AnalyticsContext";
import { useAnalyticsData, useRawAnalyticsData } from "./hooks/useAnalyticsData";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { EventsAGGrid } from "./AnalyticsGraph";
import { cn } from "@/lib/utils";

export const INTERVALS: {
  [key: string]: string;
} = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export const AnalyticsView = ({ env }: { env: AppEnv }) => {
  const [searchParams] = useSearchParams();
  const [selectedInterval, setSelectedInterval] = useState("30d");
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [clickHouseDisabled, setClickHouseDisabled] = useState(false);

  const customerId = searchParams.get("customer_id");

  // Get selected features and events from query parameters
  const currentFeatureIds =
    searchParams.get("feature_ids")?.split(",").filter(Boolean) || [];
  const currentEventNames =
    searchParams.get("event_names")?.split(",").filter(Boolean) || [];
  const allSelectedItems = [...currentFeatureIds, ...currentEventNames];

  const {
    customer,
    features,
    events,
    queryLoading,
    featuresLoading,
    error,
    bcExclusionFlag,
  } = useAnalyticsData();

  const { rawEvents, queryLoading: rawQueryLoading } = useRawAnalyticsData();

  console.log("Customer:", customer);
  console.log("Features:", features);
  console.log("Events:", events);
  console.log("Selected items:", allSelectedItems);
  console.log("Error:", error);
  console.log("Raw events:", rawEvents);

  const chartConfig = events?.meta.filter((x: any) => x.name != "period").map((x: any, index: number) => {
    if(x.name != "period") {
      const colors = ["#9c5aff", "#a97eff", "#8268ff", "#7571ff", "#687aff", "#5b83ff", "#4e8cff", "#4195ff", "#349eff", "#27a7ff"];
      const colorIndex = index % colors.length;
      
      return {
        xKey: "period",
        yKey: x.name,
        type: "bar",
        stacked: true,
        yName: x.name.replace("_count", ""),
        fill: colors[colorIndex],
      }
    }
  })

  console.log("Chart config:", chartConfig);

  useEffect(() => {
    if (error) {
      if (error.response.data.code === ErrCode.ClickHouseDisabled) {
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
        selectedInterval,
        setSelectedInterval,
        eventNames,
        setEventNames,
        featureIds,
        setFeatureIds,
        features,
        bcExclusionFlag,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm pb-0 scrollbar-hide">
        <h1 className={cn("text-xl font-medium shrink-0 pl-10", env === AppEnv.Sandbox ? "pt-4" : "pt-6")}>Analytics</h1>
        <PageSectionHeader title="Events" endContent={<QueryTopbar />} />
        <div className="h-[350px]">
          <div className="flex-1 px-10">
            {!customer && (!queryLoading || (eventNames.length > 0 || featureIds.length > 0)) && (
              <p className="text-t3 text-sm">
                Select a customer to query their events
              </p>
            )}
            {queryLoading && customerId && (eventNames.length > 0 || featureIds.length > 0) && (
              <p className="text-t3 text-sm shimmer w-fit">
                Fetching events for {customerId}
              </p>
            )}
          </div>
          {events && events.data.length > 0 && (
            <Card className="w-full bg-transparent border-none rounded-none shadow-none">
              <CardContent className="p-0 h-full bg-transparent">
                <EventsBarChart data={events} chartConfig={chartConfig} />
              </CardContent>
            </Card>
          )}
        </div>

        <PageSectionHeader title="Raw Events" className="h-10" />

        {rawQueryLoading && (
          <p className="text-t3 text-sm shimmer w-fit">
            Fetching raw events for {customerId}
          </p>
        )}

        {rawEvents && !rawQueryLoading && (
          <Card className="w-full h-full bg-transparent border-none rounded-none shadow-none py-0 pb-4">
            <CardContent className="p-0 h-[600px] bg-transparent overflow-hidden">
              <EventsAGGrid data={rawEvents} />
            </CardContent>
          </Card>
        )}

      </div>
    </AnalyticsContext.Provider>
  );
};

export const AnalyticsSkeleton = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h3 className="text-sm text-t2 font-bold">Loading...</h3>
    </div>
  );
};

export const FeatureDropdownHeader = ({ text }: { text: string }) => {
  return (
    <>
      <div className="pl-1">
        <p className="text-xs text-t3">{text}</p>
      </div>
      <DropdownMenuSeparator />
    </>
  );
};