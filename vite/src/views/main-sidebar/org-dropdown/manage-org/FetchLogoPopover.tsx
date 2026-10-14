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
	onFetched: (publicUrl: string) => Promise<boolean>;
	disabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [fetching, setFetching] = useState(false);
	const [unsavedLogo, setUnsavedLogo] = useState<{
		url: string;
		publicUrl: string;
	} | null>(null);

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
