import {
	Button,
	Input,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { Pin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useSavedViewsQuery } from "../../hooks/useSavedViewsQuery";

interface SaveViewPopoverProps {
	onClose?: () => void;
}

export const SaveViewPopover = ({ onClose }: SaveViewPopoverProps) => {
	const [name, setName] = useState("");
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const { refetch: refetchSavedViews } = useSavedViewsQuery();

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Please enter a view name");
			return;
		}

		try {
			setLoading(true);

			// Get current search params and encode as base64
			const currentParams = new URLSearchParams(window.location.search);
			// Remove page and lastItemId from saved params
			currentParams.delete("page");
			currentParams.delete("lastItemId");

			const paramsString = currentParams.toString();
			const encodedParams = btoa(paramsString);

			await axiosInstance.post("/saved_views/save", {
				name: name.trim(),
				filters: encodedParams,
			});

			toast.success(`View "${name}" saved successfully`);
			setName("");
			setOpen(false);
			onClose?.(); // Close the main filter modal
			refetchSavedViews(); // Refresh the views list
		} catch (error) {
			console.error(error);
			toast.error(getBackendErr(error, "Failed to save view"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex-1 flex items-center justify-center gap-1.5 rounded-br-lg px-2 py-1.5 text-xs text-tertiary-foreground hover:text-muted-foreground hover:bg-accent cursor-default",
						open && "bg-accent text-foreground",
					)}
				>
					<Pin size={10} />
					Save
				</button>
			</PopoverTrigger>
			<PopoverContent
				sideOffset={2}
				align="start"
				className="bg-interactive-secondary border flex flex-col gap-3 pt-3 w-[350px]"
				onEscapeKeyDown={() => setOpen(false)}
				onPointerDownOutside={() => setOpen(false)}
			>
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Save view</p>
					<span className="text-tertiary-foreground text-xs">
						Save your current filters to easily access them later.
					</span>
				</div>

				<div className="flex gap-2">
					<Input
						placeholder="View name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleSave();
							}
						}}
					/>
					<Button variant="primary" onClick={handleSave} isLoading={loading}>
						Save
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
