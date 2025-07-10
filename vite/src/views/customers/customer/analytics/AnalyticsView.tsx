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
import { ComboBox } from "./components/ComboBox";

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
  const [selectedInterval, setSelectedInterval] = useState("24h");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [featureNames, setFeatureNames] = useState<string[]>([]);
  const [noEventsFound, setNoEventsFound] = useState(false);
  const [eventsData, setEventsData] = useState<any>(null);

  const customerId = searchParams.get("customer_id");

  const {
    data,
    isLoading,
    mutate: cusMutate,
  } = useAxiosSWR({
    url: `/customers/${customerId}/data`,
    env,
  });

  const {
    data: featuresData,
    isLoading: featuresLoading,
    error,
    mutate: featureMutate,
  } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
  });

  useEffect(() => {
    let featureNames: string[] = [];
    let eventNames: string[] = [];

    if (!featuresData) return;
    console.log("Raw features", featuresData);
    featuresData.features.forEach((feature: any) => {
      if (feature.config.usage_type === "continuous_use") return;
      // If the feature has only one filter and it's the feature id, add the feature name to the list
      let featureName = feature.id;
      let featureFilters: any[][] = feature.config.filters
        .map((filter: any) => filter.value)
        .filter((f: any) => f != featureName);

      console.log("featureFilters", featureFilters);
      console.log("featureName", featureName);

      featureNames.push(featureName);
      featureFilters.forEach((f: any) => {
        f.forEach((f: any) => {
          if (f) {
            eventNames.push(f);
          }
        });
      });
    });

    setEventNames([...new Set(eventNames)]);
    setFeatureNames([...new Set(featureNames)]);

    console.log("eventNames", eventNames);
  }, [featuresData]);

  useEffect(() => {
    setIsLoadingEvents(true);
    console.log(selectedFeatures, selectedInterval);
    async function fetchEvents() {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/analytics/events/${customerId}`,
        {
          method: "POST",
          body: JSON.stringify({
            interval: selectedInterval,
            event_names: selectedFeatures.map((feature) => feature),
          }),
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );
      const data = await response.json();
      if (response.status === 200) {
        if (data.rows === 0) setNoEventsFound(true);
        else setNoEventsFound(false);

        setIsLoadingEvents(false);
      } else {
        setNoEventsFound(true);
        setIsLoadingEvents(false);
      }
      return setEventsData(data);
    }
    fetchEvents();
  }, [selectedFeatures, selectedInterval]);

  useEffect(() => {
    async function reload() {
      setSelectedFeatures([]);
      setSelectedInterval("24h");
      setEventsData(null);
      setNoEventsFound(false);
      setIsLoadingEvents(false);
      await cusMutate();
      await featureMutate();
    }
    reload();
  }, [searchParams]);

  if (isLoading) {
    return;
  }

  if (!customerId) {
    window.location.href = env === AppEnv.Sandbox ? "/sandbox/customers" : "/customers";
  }

  return (
    <div className="flex flex-col w-full h-full max-w-screen overflow-hidden">
      {/* Breadcrumb Navigation */}
      <div className="h-[60px] p-6 pb-5">
        <Breadcrumb>
          <BreadcrumbList className="text-t3 text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer"
                onClick={() => navigateTo("/customers", navigate, env)}
              >
                Customers
              </BreadcrumbLink>
            </BreadcrumbItem>

            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer"
                onClick={() => navigateTo(`/customers`, navigate, env)}
              >
                Analytics
              </BreadcrumbLink>
            </BreadcrumbItem>

            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer"
                onClick={() =>
                  navigateTo(
                    `/customers/${searchParams.get("customer_id")}`,
                    navigate,
                    env,
                  )
                }
              >
                {data?.customer.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Events Header */}
      <div className="h-[48px] flex items-center justify-between bg-stone-100 px-6 border-y">
        <h2 className="text-sm text-t2 font-medium">Events</h2>
        <div className="flex items-center gap-4">
          <ComboBox env={env} currentName={data?.customer.name} currentId={data?.customer.id} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 px-3 text-xs">
                {INTERVALS[selectedInterval]}
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              {Object.keys(INTERVALS).map((interval) => (
                <DropdownMenuItem onClick={() => setSelectedInterval(interval)}>
                  {INTERVALS[interval]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 px-3 text-xs">
                {selectedFeatures.length > 0
                  ? `${selectedFeatures.length} Selected`
                  : "All Features"}
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              {featureNames.length > 0 && <FeatureDropdownHeader text="Features" />}

              {featureNames.map((feature) => (
                <DropdownMenuCheckboxItem
                  checked={selectedFeatures.includes(feature)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      if (selectedFeatures.length === 10) {
                        toast.error(
                          "You can only select up to 10 events/features",
                        );
                      } else {
                        setSelectedFeatures([...selectedFeatures, feature]);
                      }
                    } else {
                      setSelectedFeatures(
                        selectedFeatures.filter((f) => f !== feature),
                      );
                    }
                  }}
                  key={feature}
                >
                  {feature}
                </DropdownMenuCheckboxItem>
              ))}
              {featureNames.length > 0 && <DropdownMenuSeparator />}

              {eventNames.length > 0 && <FeatureDropdownHeader text="Events" />}

              {eventNames.map((event) => (
                <DropdownMenuCheckboxItem
                  checked={selectedFeatures.includes(event)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      if (selectedFeatures.length === 10) {
                        toast.error(
                          "You can only select up to 10 events/features",
                        );
                      } else {
                        setSelectedFeatures([...selectedFeatures, event]);
                      }
                    } else {
                      setSelectedFeatures(
                        selectedFeatures.filter((f) => f !== event),
                      );
                    }
                  }}
                  key={event}
                >
                  {event}
                </DropdownMenuCheckboxItem>                
              ))}

              {eventNames.length > 0 && <DropdownMenuSeparator />}

              <FeatureDropdownHeader text="Actions" />

              <DropdownMenuItem onClick={() => {
                  setSelectedFeatures([]);
                  setEventsData(null);
                  setNoEventsFound(false);
                  setIsLoadingEvents(false);
                }}>
                  Clear filters
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Events Content Area */}
      <div className="flex-1 p-6">
        {selectedFeatures.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <h3 className="text-sm text-t2 font-bold">
              Select some filters to get started
            </h3>
          </div>
        )}

        {isLoadingEvents && <AnalyticsSkeleton />}

        {noEventsFound && selectedFeatures.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full">
            <h3 className="text-sm text-t2 font-bold">No events found</h3>
          </div>
        )}

        {(eventsData && !isLoadingEvents && !noEventsFound) && (
          <Card className="w-full" style={{ height: '1000px' }}>
            <CardContent className="p-4 h-full">
              <EventsBarChart
                data={eventsData}
                chartConfig={Object.fromEntries(
                  selectedFeatures.map((f: string, i: number) => {
                    let outOfTen = i + 1;
                    if (outOfTen > 10) outOfTen = 1;
                    return [
                      f + "_count",
                      {
                        label: f,
                        color: `var(--chart-${outOfTen})`,
                      },
                    ];
                  }),
                )}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>);
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
