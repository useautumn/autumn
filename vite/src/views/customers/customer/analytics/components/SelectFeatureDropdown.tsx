import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronDown, Check, X } from "lucide-react";
import { useAnalyticsContext } from "../AnalyticsContext";
import { Feature, FeatureType, FeatureUsageType } from "@autumn/shared";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSearchParams, useNavigate, useLocation } from "react-router";
import { eventNameBelongsToFeature, getAllEventNames } from "../utils/getAllEventNames";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

const MAX_NUM_SELECTED = 10;

export const SelectFeatureDropdown = ({
  classNames,
}: {
  classNames?: {
    trigger?: string;
  };
}) => {
  const { features, hasCleared, setHasCleared } = useAnalyticsContext();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

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

  // Create combined options for search
  const featureOptions = features.filter((feature: Feature) => feature.type === FeatureType.Metered && feature.config.usage_type === FeatureUsageType.Single).map((feature: Feature) => ({
    type: "feature" as const,
    id: feature.id,
    name: feature.name,
    selected: currentFeatureIds.includes(feature.id),
  }));

  const eventOptions = allEventNames.filter((eventName: string) => eventNameBelongsToFeature({ eventName, features })).map((eventName: string) => ({
    type: "event" as const,
    id: eventName,
    name: eventName,
    selected: currentEventNames.includes(eventName),
  }));

  const allOptions = [...featureOptions, ...eventOptions];

  // Filter options based on search
  const filteredOptions = allOptions.filter((option) =>
    option.name.toLowerCase().includes(searchValue.toLowerCase()),
  );

  const filteredFeatures = filteredOptions.filter(
    (option) => option.type === "feature",
  );
  const filteredEvents = filteredOptions.filter(
    (option) => option.type === "event",
  );

  const handleToggleItem = (option: (typeof allOptions)[0]) => {
    if (option.type === "feature") {
      if (option.selected) {
        updateQueryParams(
          currentFeatureIds.filter((id: string) => id !== option.id),
          currentEventNames,
        );
      } else {
        if (numSelected === MAX_NUM_SELECTED) {
          toast.error(`You can only select up to ${MAX_NUM_SELECTED} events/features`);
        } else {
          updateQueryParams(
            [...currentFeatureIds, option.id],
            currentEventNames,
          );
        }
      }
    } else {
      if (option.selected) {
        updateQueryParams(
          currentFeatureIds,
          currentEventNames.filter((name: string) => name !== option.id),
        );
      } else {
        if (numSelected === MAX_NUM_SELECTED) {
          toast.error(`You can only select up to ${MAX_NUM_SELECTED} events/features`);
        } else {
          updateQueryParams(currentFeatureIds, [
            ...currentEventNames,
            option.id,
          ]);
        }
      }
    }
  };

  const handleClear = () => {
    updateQueryParams([], []);
    setHasCleared(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 px-3 text-xs justify-between",
            classNames?.trigger,
          )}
        >
          {numSelected > 0 ? `${numSelected} Selected` : "All Features"}
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="end">
        <Command>
          <CommandInput
            placeholder="Search..."
            value={searchValue}
            onValueChange={setSearchValue}
            className="h-9"
          />
          <div className="max-h-[300px] overflow-y-auto">
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              {filteredFeatures.length > 0 && (
                <CommandGroup heading="Features">
                  {filteredFeatures.map((option) => (
                    <CommandItem
                      key={`feature-${option.id}`}
                      onSelect={() => handleToggleItem(option)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={option.selected}
                          className="h-4 w-4"
                        />
                        <span className="text-xs">{option.name}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {filteredEvents.length > 0 && (
                <>
                  {filteredFeatures.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Events">
                    {filteredEvents.map((option, index) => (
                      <CommandItem
                        key={`${index + filteredFeatures.length}`}
                        onSelect={() => handleToggleItem(option)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={option.selected}
                            className="h-4 w-4"
                          />
                          <span className="text-xs">{option.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </div>

          <div className="border-t p-2">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="h-7 px-3 text-xs"
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setOpen(false)}
                className="h-7 px-3 text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
