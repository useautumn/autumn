import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { AsyncTrackConfigForm } from "./AsyncTrackConfigForm";

export type AsyncTrackConfigResponse = {
	enabledOrgIds: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export function AsyncTrackDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const { data, error, isLoading, dataUpdatedAt } =
		useQuery<AsyncTrackConfigResponse>({
			queryKey: ["admin-edge-config", "async-track"],
			queryFn: async () => {
				const response = await axiosInstance.get("/admin/async-track-config");
				return response.data;
			},
			enabled: open,
		});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Async Track</DialogTitle>
					<DialogDescription className="text-pretty">
						Tracks from these organizations are queued as if they sent{" "}
						<span className="font-mono">async: true</span>. Entries may be org
						IDs or slugs.
					</DialogDescription>
				</DialogHeader>

				{isLoading && (
					<p className="py-8 text-center text-sm text-tertiary-foreground">
						Loading...
					</p>
				)}
				{error && (
					<p className="text-pretty text-sm text-destructive">
						{getBackendErr(error, "Failed to load Async Track config")}
					</p>
				)}
				{data && (
					<AsyncTrackConfigForm
						key={dataUpdatedAt}
						config={data}
						onSaved={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
