"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAxiosPostSWR } from "@/services/useAxiosSwr";
import { AppEnv } from "@autumn/shared";
import { debounce } from "lodash";
import { useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import { navigateTo } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";
import { useAnalyticsContext } from "../AnalyticsContext";

export function CustomerComboBox({
  classNames,
}: {
  classNames?: {
    trigger?: string;
  };
}) {
  const env = useEnv();
  const navigate = useNavigate();
  const { customer } = useAnalyticsContext();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [cusId, setCusId] = React.useState(customer?.id);

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/v1/customers/all/search`,
    env,
    data: {
      search: value || "",
      page_size: 25,
    },
  });

  const debouncedSearch = useCallback(
    debounce(async (searchValue: string) => {
      setIsSearching(true);
      console.log("Searching for:", searchValue);
      await mutate();
      setIsSearching(false);
    }, 300),
    [mutate],
  );

  useEffect(() => {
    if (value) {
      debouncedSearch(value);
    } else {
      setIsSearching(false);
    }
  }, [value, debouncedSearch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-[200px] justify-between text-xs",
            classNames?.trigger,
          )}
        >
          {customer?.name || customer?.id || "Switch customer"}
          <ChevronsUpDown className="opacity-50 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command filter={() => 1}>
          <CommandInput
            placeholder="Search customer..."
            className="h-9"
            onValueChange={(e) => setValue(e)}
          />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-t3" size={14} />
                <span className="ml-2 text-sm text-muted-foreground">
                  Searching...
                </span>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {value ? "No customer found." : "Search for a customer..."}
                </CommandEmpty>
                <CommandGroup>
                  {value &&
                    data?.customers?.map((c: any) => {
                      if (c.name === customer?.name) {
                        return null;
                      }
                      return (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            navigateTo(
                              `/analytics?customer_id=${c.id}`,
                              navigate,
                              env,
                            );
                            setOpen(false);
                          }}
                        >
                          {c.name || c.email}{" "}
                          <span className="text-xs text-t3">
                            {c.id && `(${c.id.slice(0, 10)}...)`}
                          </span>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
