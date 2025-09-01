import { Delete } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCustomersContext } from "../CustomersContext";

interface SavedView {
	id: string;
	name: string;
	filters: string; // base64 encoded
	created_at: string;
}

export const SavedViews = ({
	views,
	mutateViews,
	setDropdownOpen,
}: {
	views: SavedView[];
	mutateViews: any;
	setDropdownOpen: (open: boolean) => void;
}) => {
	const { setQueryStates, mutate } = useCustomersContext();
	const axiosInstance = useAxiosInstance();
	const [deletingViewId, setDeletingViewId] = useState<string | null>(null);

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
				none: params.get("none") || "",
			};

			setQueryStates(queryParams);

			// Explicitly trigger a data refetch to ensure the view is applied immediately
			await mutate();

			toast.success(`Applied filters from ${view.name} view`);
		} catch (error) {
			console.error(error);
			toast.error("Failed to apply view");
		}
	};

	const deleteView = async (viewId: string, viewName: string) => {
		setDeletingViewId(viewId);
		try {
			await axiosInstance.delete(`/saved_views/${viewId}`);
			toast.success(`Deleted ${viewName} view`);
			await mutateViews();
		} catch (error) {
			console.error(error);
			toast.error(getBackendErr(error, "Failed to delete view"));
		} finally {
			setDeletingViewId(null);
		}
	};

	if (views.length === 0) return null;

	return (
		<>
			<DropdownMenuLabel className="p-0 pt-1 px-3">
				<span className="text-t3 text-xs">Saved views</span>
			</DropdownMenuLabel>
			<DropdownMenuGroup className="p-1">
				{views.map((view: SavedView) => (
					<div
						key={view.id}
						className="flex items-center justify-between cursor-pointer px-2 hover:bg-zinc-100 rounded-sm"
						onClick={async () => {
							await applyView(view);
							setDropdownOpen(false);
						}}
					>
						<DropdownMenuItem
							key={view.id}
							className="px-0 hover:bg-transparent"
						>
							<span className="truncate flex-1">{view.name}</span>
						</DropdownMenuItem>
						<Popover>
							<PopoverTrigger asChild>
								<button
									onClick={(e) => {
										e.stopPropagation();
									}}
									className="ml-2 p-1 hover:bg-zinc-200 rounded"
								>
									<Delete size={12} className="text-t3" />
								</button>
							</PopoverTrigger>
							<PopoverContent
								sideOffset={2}
								align="start"
								className="border border-zinc-200 w-64 z-50"
								onOpenAutoFocus={(e) => e.preventDefault()}
								onCloseAutoFocus={(e) => e.preventDefault()}
							>
								<div className="flex flex-col gap-3 text-sm">
									<p className="text-t3">
										Are you sure you want to delete the view "{view.name}"?
									</p>
									<div className="flex gap-2">
										<Button
											variant="destructive"
											size="sm"
											className="flex-1"
											onClick={async (e) => {
												e.stopPropagation();
												await deleteView(view.id, view.name);
											}}
											isLoading={deletingViewId === view.id}
										>
											Delete
										</Button>
									</div>
								</div>
							</PopoverContent>
						</Popover>
					</div>
				))}
			</DropdownMenuGroup>
			<DropdownMenuSeparator className="m-0" />
		</>
	);
};
