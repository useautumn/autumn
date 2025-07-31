import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomersContext } from "./CustomersContext";
import { getBackendErr } from "@/utils/genUtils";
import { LayoutDashboard, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SavedDashboard {
  id: string;
  name: string;
  filters: string; // base64 encoded
  created_at: string;
}

export const SavedDashboardsDropdown = () => {
  const { env, setFilters, setQueryStates } = useCustomersContext();
  const axiosInstance = useAxiosInstance();
  
  const { data: dashboardsData, isLoading: loading, mutate: refetchDashboards } = useAxiosSWR({
    url: "/v1/dashboards",
    env,
  });

  const dashboards = dashboardsData?.dashboards || [];

  const applyDashboard = (dashboard: SavedDashboard) => {
    try {
      // Decode base64 filters
      const decodedParams = atob(dashboard.filters);
      const params = new URLSearchParams(decodedParams);
      
      // Apply all parameters using setQueryStates (this will reset pagination automatically)
      const queryParams: Record<string, string | number> = {
        page: 1,
        lastItemId: "",
        q: params.get("q") || "",
        status: params.get("status") || "",
        product_id: params.get("product_id") || "",
        version: params.get("version") || "",
      };
      
      setQueryStates(queryParams);
      
      toast.success(`Applied dashboard: ${dashboard.name}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply dashboard");
    }
  };

  const deleteDashboard = async (dashboardId: string, dashboardName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await axiosInstance.delete(`/v1/dashboards/${dashboardId}`);
      toast.success(`Deleted dashboard: ${dashboardName}`);
      await refetchDashboards(); // Refresh list
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, "Failed to delete dashboard"));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-t3 bg-transparent shadow-none p-0">
          <LayoutDashboard size={13} className="mr-2 text-t3" />
          Dashboards
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-t3 !font-regular text-xs">
          Saved Dashboards
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : dashboards.length === 0 ? (
          <DropdownMenuItem disabled>No saved dashboards</DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            {dashboards.map((dashboard: SavedDashboard) => (
              <DropdownMenuItem
                key={dashboard.id}
                onClick={() => applyDashboard(dashboard)}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="truncate flex-1">{dashboard.name}</span>
                <button
                  onClick={(e) => deleteDashboard(dashboard.id, dashboard.name, e)}
                  className="ml-2 p-1 hover:bg-red-100 rounded"
                >
                  <Trash2 size={12} className="text-red-500" />
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};