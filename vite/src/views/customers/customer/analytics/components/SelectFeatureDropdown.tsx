import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { INTERVALS } from "./QueryTopbar";
import { useAnalyticsContext } from "../AnalyticsContext";
import { Feature } from "@autumn/shared";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSearchParams, useNavigate, useLocation } from "react-router";
import { getAllEventNames } from "../utils/getAllEventNames";
import { useEffect } from "react";

export const SelectFeatureDropdown = ({
  classNames,
}: {
  classNames?: {
    trigger?: string;
  };
}) => {
  const { features, hasCleared, setHasCleared } = useAnalyticsContext();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Get all event names
  const allEventNames = getAllEventNames({ features });

  // Read current values from query parameters
  const currentFeatureIds =
    searchParams.get("feature_ids")?.split(",").filter(Boolean) || [];
  const currentEventNames =
    searchParams.get("event_names")?.split(",").filter(Boolean) || [];

  // If no selections are made, default to the first 10 items (features first, then events)
  useEffect(() => {
    if (currentFeatureIds.length === 0 && currentEventNames.length === 0 && !hasCleared) {
      const defaultFeatureIds = features.slice(0, 10).map((feature: Feature) => feature.id);
      const remainingSlots = 10 - defaultFeatureIds.length;
      const defaultEventNames = remainingSlots > 0 ? allEventNames.slice(0, remainingSlots) : [];
      
      updateQueryParams(defaultFeatureIds, defaultEventNames);
    }
  }, [features, allEventNames, hasCleared]);

  // Helper function to update query parameters
  const updateQueryParams = (featureIds: string[], eventNames: string[]) => {
    const params = new URLSearchParams(location.search);

    if (featureIds.length > 0) {
      params.set("feature_ids", featureIds.join(","));
    } else {
      params.delete("feature_ids");
    }

    if (eventNames.length > 0) {
      params.set("event_names", eventNames.join(","));
    } else {
      params.delete("event_names");
    }

    navigate(`${location.pathname}?${params.toString()}`);
  };

  const numSelected = currentFeatureIds.length + currentEventNames.length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={cn("h-8 px-3 text-xs", classNames?.trigger)}
          >
            {numSelected > 0 ? `${numSelected} Selected` : "All Features"}
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {features.length > 0 && <FeatureDropdownHeader text="Features" />}
          {features.map((feature: Feature) => (
            <DropdownMenuCheckboxItem
              checked={currentFeatureIds.includes(feature.id)}
              onCheckedChange={(checked) => {
                if (checked) {
                  if (numSelected === 10) {
                    toast.error("You can only select up to 10 events/features");
                  } else {
                    updateQueryParams(
                      [...currentFeatureIds, feature.id],
                      currentEventNames,
                    );
                  }
                } else {
                  updateQueryParams(
                    currentFeatureIds.filter((f: string) => f !== feature.id),
                    currentEventNames,
                  );
                }
              }}
              key={feature.id}
            >
              {feature.name}
            </DropdownMenuCheckboxItem>
          ))}
          {features.length > 0 && <DropdownMenuSeparator />}

          {allEventNames.length > 0 && <FeatureDropdownHeader text="Events" />}

          {allEventNames.map((eventName: string) => (
            <DropdownMenuCheckboxItem
              checked={currentEventNames.includes(eventName)}
              onCheckedChange={(checked) => {
                if (checked) {
                  if (numSelected === 10) {
                    toast.error("You can only select up to 10 events/features");
                  } else {
                    updateQueryParams(currentFeatureIds, [
                      ...currentEventNames,
                      eventName,
                    ]);
                  }
                } else {
                  updateQueryParams(
                    currentFeatureIds,
                    currentEventNames.filter((f: string) => f !== eventName),
                  );
                }
              }}
              key={eventName}
            >
              {eventName}
            </DropdownMenuCheckboxItem>
          ))}

          {allEventNames.length > 0 && <DropdownMenuSeparator />}

          <FeatureDropdownHeader text="Actions" />

          <DropdownMenuItem
            onClick={() => {
              updateQueryParams([], []);
              setHasCleared(true);
            }}
          >
            Clear filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
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
