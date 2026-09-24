import {
	Button,
	Input,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { GlobeIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const FetchLogoPopover = ({
	onFetched,
	disabled,
}: {
	/** Saves the fetched logo; resolves false if the save failed. */
	onFetched: (publicUrl: string) => Promise<boolean>;
	disabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [fetching, setFetching] = useState(false);

	const handleFetch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim()) return;

		setFetching(true);
		try {
			const { data } = await axiosInstance.post("/organization/logo/fetch", {
				url,
			});
			// Keep the popover (and the typed URL) open so a failed save can be retried.
			const saved = await onFetched(data.publicUrl);
			if (!saved) return;
			setOpen(false);
			setUrl("");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to fetch logo"));
		} finally {
			setFetching(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" disabled={disabled}>
					<GlobeIcon className="size-3" />
					Fetch from URL
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72">
				<form onSubmit={handleFetch} className="flex flex-col gap-3 text-sm">
					<p className="text-tertiary-foreground">
						Pull the logo from your website
					</p>
					<Input
						autoFocus
						placeholder="yourcompany.com"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
					/>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						className="w-fit"
						isLoading={fetching}
						disabled={!url.trim()}
					>
						Fetch logo
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
};
