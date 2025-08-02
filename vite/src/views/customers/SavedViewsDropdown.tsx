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
import { BookmarkIcon, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SavedView {
  id: string;
  name: string;
  filters: string; // base64 encoded
  created_at: string;
}

export const SavedViewsDropdown = () => {
  const { env, setFilters, setQueryStates, mutate } = useCustomersContext();
  const axiosInstance = useAxiosInstance();

  const { data: savedViewsData, isLoading: loading, mutate: refetchSavedViews } = useAxiosSWR({
    url: "/saved_views",
    env,
  });

  const views = savedViewsData?.views || [];

  const applyView = async (view: SavedView) => {
    try {
      // Decode base64 filters
      const decodedParams = atob(view.filters);
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
      
      // Explicitly trigger a data refetch to ensure the view is applied immediately
      await mutate();
      
      toast.success(`Applied view: ${view.name}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply view");
    }
  };

  const deleteView = async (viewId: string, viewName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await axiosInstance.delete(`/saved_views/${viewId}`);
      toast.success(`Deleted view: ${viewName}`);
      await refetchSavedViews(); // Refresh list
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, "Failed to delete view"));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-t3 bg-transparent shadow-none p-0">
          <BookmarkIcon size={13} className="mr-2 text-t3" />
          Views
        </Button> 
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-t3 !font-regular text-xs">
          Saved Views
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : views.length === 0 ? (  
          <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            {views.map((view: SavedView) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => applyView(view)}
                className="flex items-center justify-between cursor-pointer"
              >
                <span className="truncate flex-1">{view.name}</span>
                <button
                  onClick={(e) => deleteView(view.id, view.name, e)}
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