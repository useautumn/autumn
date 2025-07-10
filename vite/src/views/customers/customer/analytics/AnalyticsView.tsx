import { useNavigate, useParams, useSearchParams } from "react-router";
import { AppEnv } from "@autumn/shared";
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
import { useAnalyticsData } from "./hooks/useAnalyticsData";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";

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
  const navigate = useNavigate();
  const axiosInstance = useAxiosInstance();
  const [selectedInterval, setSelectedInterval] = useState("24h");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [featureNames, setFeatureNames] = useState<string[]>([]);
  const [noEventsFound, setNoEventsFound] = useState(false);
  const [eventsData, setEventsData] = useState<any>(null);

  const customerId = searchParams.get("customer_id");

  // Get selected features and events from query parameters
  const currentFeatureIds =
    searchParams.get("feature_ids")?.split(",").filter(Boolean) || [];
  const currentEventNames =
    searchParams.get("event_names")?.split(",").filter(Boolean) || [];
  const allSelectedItems = [...currentFeatureIds, ...currentEventNames];

  const { customer, features, events, queryLoading, featuresLoading } =
    useAnalyticsData();

  console.log("Customer:", customer);
  console.log("Features:", features);
  console.log("Events:", events);
  console.log("Selected items:", allSelectedItems);

  // Debug chart config
  const chartConfig = Object.fromEntries(
    allSelectedItems.map((f: string, i: number) => {
      let outOfTen = i + 1;
      if (outOfTen > 10) outOfTen = 1;
      // Convert hyphens to underscores to match data field names
      const fieldName = f.replace(/-/g, "_") + "_count";
      return [
        fieldName,
        {
          label: f,
          color: `var(--chart-${outOfTen})`,
        },
      ];
    }),
  );
  console.log("Chart config:", chartConfig);

  // useEffect(() => {
  //   const featureNames: string[] = [];
  //   const eventNames: string[] = [];

  //   if (!featuresData) return;

  //   featuresData.features.forEach((feature: any) => {
  //     if (feature.config.usage_type === "continuous_use") return;
  //     // If the feature has only one filter and it's the feature id, add the feature name to the list
  //     const featureName = feature.id;
  //     const featureFilters: any[][] = feature.config.filters
  //       .map((filter: any) => filter.value)
  //       .filter((f: any) => f != featureName);

  //     featureNames.push(featureName);
  //     featureFilters.forEach((f: any) => {
  //       f.forEach((f: any) => {
  //         if (f) {
  //           eventNames.push(f);
  //         }
  //       });
  //     });
  //   });

  //   setEventNames([...new Set(eventNames)]);
  //   setFeatureNames([...new Set(featureNames)]);
  // }, [featuresData]);

  // useEffect(() => {
  //   setIsLoadingEvents(true);

  //   async function fetchEvents() {
  //     const res = await axiosInstance.post(`/query/events/${customerId}`, {
  //       interval: selectedInterval,
  //       event_names: selectedFeatures.map((feature) => feature),
  //     });

  //     const data = res.data;

  //     if (res.status === 200) {
  //       if (data.rows === 0) setNoEventsFound(true);
  //       else setNoEventsFound(false);
  //       setIsLoadingEvents(false);
  //     } else {
  //       setNoEventsFound(true);
  //       setIsLoadingEvents(false);
  //     }
  //     return setEventsData(data);
  //   }
  //   fetchEvents();
  // }, [selectedFeatures, selectedInterval]);

  // useEffect(() => {
  //   async function reload() {
  //     setSelectedFeatures([]);
  //     setSelectedInterval("24h");
  //     setEventsData(null);
  //     setNoEventsFound(false);
  //     setIsLoadingEvents(false);
  //     await cusMutate();
  //     await featureMutate();
  //   }
  //   reload();
  // }, [searchParams]);

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
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Analytics</h1>
        <PageSectionHeader title="Events" endContent={<QueryTopbar />} />

        <div className="h-[350px]">
          <div className="flex-1 px-10">
            {/* {selectedFeatures.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full">
                <h3 className="text-sm text-t2 font-bold">
                  Select some filters to get started
                </h3>
              </div>
            )} */}
            {!customer && !queryLoading && (
              <p className="text-t3 text-sm">
                Select a customer to query their events
              </p>
            )}
            {queryLoading && customerId && (
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

// <div className="h-[60px] p-6 pb-5">
// <Breadcrumb>
//   <BreadcrumbList className="text-t3 text-xs">
//     <BreadcrumbItem>
//       <BreadcrumbLink
//         className="cursor-pointer"
//         onClick={() => navigateTo("/customers", navigate, env)}
//       >
//         Customers
//       </BreadcrumbLink>
//     </BreadcrumbItem>

//     <BreadcrumbSeparator />

//     <BreadcrumbItem>
//       <BreadcrumbLink
//         className="cursor-pointer"
//         onClick={() => navigateTo(`/customers`, navigate, env)}
//       >
//         Analytics
//       </BreadcrumbLink>
//     </BreadcrumbItem>

//     <BreadcrumbSeparator />

//     <BreadcrumbItem>
//       <BreadcrumbLink
//         className="cursor-pointer"
//         onClick={() =>
//           navigateTo(
//             `/customers/${searchParams.get("customer_id")}`,
//             navigate,
//             env,
//           )
//         }
//       >
//         {data?.customer.name}
//       </BreadcrumbLink>
//     </BreadcrumbItem>
//   </BreadcrumbList>
// </Breadcrumb>
// </div>
