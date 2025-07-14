import {
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router";
import { AppEnv } from "@autumn/shared";

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

import { useAnalyticsContext } from "../AnalyticsContext";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";

export const INTERVALS: Record<string, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1bc": "Last billing cycle",
  "3bc": "Last 3 billing cycles",
};

export const QueryTopbar = () => {
  const { customer, selectedInterval, setSelectedInterval, bcExclusionFlag } =
    useAnalyticsContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const updateQueryParams = (key: string, value: string) => {
    const params = new URLSearchParams(location.search);
    params.set(key, value);
    navigate(`${location.pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center py-0 h-full">
      <CustomerComboBox
        classNames={{
          trigger: "h-full border-y-0 border-l border-r-0",
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="px-3 text-xs h-full border-y-0 border-x"
          >
            {INTERVALS[selectedInterval]}
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {Object.keys(INTERVALS).filter((interval) => {
            if(bcExclusionFlag) {
              return interval !== "1bc" && interval !== "3bc";
            }
            return true;
          }).map((interval) => (
            <DropdownMenuItem
              key={interval}
              onClick={() => {
                setSelectedInterval(interval);
                updateQueryParams("interval", interval);
              }}
            >
              {INTERVALS[interval]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <SelectFeatureDropdown
        classNames={{
          trigger: "h-full border-y-0 border-l-0 border-r-1",
        }}
      />
    </div>
  );
};
