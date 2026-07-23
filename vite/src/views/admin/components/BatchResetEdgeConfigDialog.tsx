import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Switch,
} from "@autumn/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type BatchResetConfig = {
	enabled: boolean;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const QUERY_KEY = ["admin-batch-reset-config"];

function BatchResetConfigForm({
	config,
	onSaved,
}: {
	config: BatchResetConfig;
	onSaved: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [enabled, setEnabled] = useState(config.enabled);

	const saveMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.put("/admin/batch-reset-config", { enabled });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
			toast.success("Batch reset config saved");
			onSaved();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save batch reset config"));
		},
	});

	return (
		<>
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between rounded-lg border border-border p-4">
					<div className="flex flex-col gap-0.5 pr-4">
						<div className="text-sm font-medium text-foreground">
							Batch resets enabled
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							When disabled, producers stop enqueueing batch entitlement resets
							and workers skip jobs already in the queue.
						</div>
					</div>
					<Switch
						aria-label="Enable batch entitlement resets"
						checked={enabled}
						onCheckedChange={setEnabled}
					/>
				</div>

				{!enabled && (
					<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-pretty text-xs text-amber-800">
						List-customer and list-entity requests will no longer schedule
						background entitlement repairs. Already queued batch-reset jobs will
						be acknowledged without running.
					</div>
				)}

				<div className="rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
					<div className="mb-2 flex items-center gap-2">
						<Badge
							variant="muted"
							className={
								config.configHealthy
									? "border-emerald-200 bg-emerald-50 text-emerald-700"
									: "border-amber-200 bg-amber-50 text-amber-700"
							}
						>
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						{config.lastSuccessAt && (
							<span>
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<div className="text-pretty">
						{config.configConfigured === false
							? "S3 batch reset config is not configured. Batch resets default to enabled."
							: config.error ||
								"Changes propagate to servers and workers within 60 seconds."}
					</div>
				</div>
			</div>

			<DialogFooter>
				<Button variant="secondary" onClick={onSaved}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => saveMutation.mutate()}
					isLoading={saveMutation.isPending}
					disabled={enabled === config.enabled}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
}

export function BatchResetEdgeConfigDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<BatchResetConfig>({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/batch-reset-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Batch Resets</DialogTitle>
					<DialogDescription className="text-pretty">
						Control production and execution of batch entitlement reset jobs at
						runtime.
					</DialogDescription>
				</DialogHeader>

				{configQuery.isLoading ? (
					<div className="py-8 text-center text-sm text-tertiary-foreground">
						Loading...
					</div>
				) : configQuery.isError ? (
					<div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
						<div className="text-pretty">
							{getBackendErr(
								configQuery.error,
								"Failed to load batch reset config",
							)}
						</div>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => configQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : configQuery.data ? (
					<BatchResetConfigForm
						key={`${configQuery.data.enabled}:${configQuery.data.lastSuccessAt ?? "never"}`}
						config={configQuery.data}
						onSaved={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
