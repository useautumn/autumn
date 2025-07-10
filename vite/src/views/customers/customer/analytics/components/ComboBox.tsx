"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { navigateTo } from "@/utils/genUtils";

export function ComboBox({
  env,
  currentName,
  currentId,
}: {
  env: AppEnv;
  currentName: string;
  currentId: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [cusId, setCusId] = React.useState(currentId);

  const [pagination, setPagination] = React.useState<{
    page: number;
    lastItemStack: any;
  }>({
    page: 1,
    lastItemStack: [],
  });

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/v1/customers/all/search`,
    env,
    data: {
      search: value || "",
      filters: {
        product_id: "",
        status: "",
      },
      page: pagination.page,
      page_size: 10,
      last_item: pagination.lastItemStack[pagination.lastItemStack.length - 1],
      last_id:
        pagination.lastItemStack[pagination.lastItemStack.length - 1]
          ?.internal_id,
    },
  });

  useEffect(() => {
    async function handleSearch() {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await mutate();
    }
    handleSearch();
  }, [value]);

  useEffect(() => {
    if (currentId !== cusId) {
      navigateTo(`/analytics?customer_id=${cusId}`, navigate, env);
    }
  }, [cusId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between text-xs"
        >
          {currentName || "Switch customer"}
          <ChevronsUpDown className="opacity-50 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput
            placeholder="Search customer..."
            className="h-9"
            value={value}
            onValueChange={(e) => setValue(e)}
          />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {data?.customers?.map((customer: any) => {
                if (customer.name === currentName) {
                  return null;
                }
                return (
                  <CommandItem
                    key={customer.id}
                    value={customer.name}
                    onSelect={() => {
                      setCusId(customer.id);
                      setOpen(false);
                    }}
                  >
                    {customer.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
