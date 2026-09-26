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
	// A logo already fetched (and stored in S3) for `url` whose save failed.
	// Retrying reuses it instead of paying for another Context.dev lookup.
	const [unsavedLogo, setUnsavedLogo] = useState<{
		url: string;
		publicUrl: string;
	} | null>(null);

	// Forget the unsaved logo whenever the popover closes: removing, uploading
	// or pasting a logo (all outside the popover) replace or delete the stored
	// object, so the remembered URL would no longer be this fetched image.
	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setUnsavedLogo(null);
	};

	const handleFetch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim()) return;

		setFetching(true);
		try {
			let publicUrl = unsavedLogo?.url === url ? unsavedLogo.publicUrl : null;
			if (!publicUrl) {
				const { data } = await axiosInstance.post("/organization/logo/fetch", {
					url,
				});
				publicUrl = data.publicUrl as string;
			}

			// Keep the popover (and the typed URL) open so a failed save can be retried.
			const saved = await onFetched(publicUrl);
			if (!saved) {
				setUnsavedLogo({ url, publicUrl });
				return;
			}
			handleOpenChange(false);
			setUrl("");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to fetch logo"));
		} finally {
			setFetching(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="secondary" disabled={disabled}>
					<GlobeIcon className="size-3" />
					Fetch from URL
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72">
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
