import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const INSTANCE_OPTIONS = [
	{
		value: "primary",
		label: "Primary",
		description: "Regional CACHE_URL endpoints",
	},
	{
		value: "fallback",
		label: "Fallback",
		description: "Global CACHE_BACKUP_URL endpoint",
	},
] as const;

type InstanceName = (typeof INSTANCE_OPTIONS)[number]["value"];

type MainRedisCacheConfig = {
	activeInstance: InstanceName;
	fallbackConfigured: boolean;
	fallbackStatus: string;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const QUERY_KEY = ["admin-edge-config", "main-redis-cache"];

function MainRedisCacheForm({
	config,
	onSaved,
}: {
	config: MainRedisCacheConfig;
	onSaved: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const saveMutation = useMutation({
		mutationFn: async (activeInstance: InstanceName) => {
			await axiosInstance.put("/admin/main-redis-cache-config", {
				activeInstance,
			});
		},
		onSuccess: async (_data, activeInstance) => {
			await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
			toast.success(`Active main Redis set to "${activeInstance}"`);
			onSaved();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to switch main Redis"));
		},
	});
	const form = useAppForm({
		defaultValues: { activeInstance: config.activeInstance },
		onSubmit: async ({ value }) => {
			await saveMutation.mutateAsync(value.activeInstance);
		},
	});

	return (
		<>
			<div className="flex flex-col gap-4">
				<form.Field name="activeInstance">
					{(field) => (
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium uppercase text-tertiary-foreground">
								Active Instance
							</div>
							<Select
								value={field.state.value}
								onValueChange={(value) =>
									field.handleChange(value as InstanceName)
								}
								items={INSTANCE_OPTIONS.map((option) => ({
									value: option.value,
									label: option.label,
								}))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{INSTANCE_OPTIONS.map((option) => (
											<SelectItem
												key={option.value}
												value={option.value}
												disabled={
													option.value === "fallback" &&
													(!config.fallbackConfigured ||
														config.fallbackStatus !== "ready")
												}
											>
												<div className="flex flex-col">
													<span className="text-sm text-foreground">
														{option.label}
													</span>
													<span className="text-xs text-tertiary-foreground">
														{option.description}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>

				<Alert>
					<AlertTitle>Connection state is not copied</AlertTitle>
					<AlertDescription>
						The switch only reroutes commands. Use a synchronized fallback when
						preserving existing locks and idempotency keys is required.
					</AlertDescription>
				</Alert>

				<div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						<Badge variant="muted">
							Fallback:{" "}
							{config.fallbackConfigured
								? config.fallbackStatus
								: "not configured"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<div className="text-pretty">
						{config.configConfigured === false
							? "S3 main Redis config is not configured. Traffic defaults to primary."
							: config.error ||
								"Changes propagate to servers, workers, and cron within 10 seconds."}
					</div>
				</div>
			</div>

			<DialogFooter>
				<Button variant="secondary" onClick={onSaved}>
					Cancel
				</Button>
				<form.Subscribe
					selector={(state) => ({
						activeInstance: state.values.activeInstance,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ activeInstance, isSubmitting }) => (
						<Button
							variant="primary"
							onClick={() => form.handleSubmit()}
							isLoading={isSubmitting}
							disabled={activeInstance === config.activeInstance}
						>
							Save
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</>
	);
}

export function MainRedisCacheDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MainRedisCacheConfig>({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				"/admin/main-redis-cache-config",
			);
			return data;
		},
		enabled: open,
		refetchInterval: open ? 2_000 : false,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Main Redis Instance
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Globally route legacy cache, auth, idempotency, rate-limit, and lock
						traffic between the primary and fallback Redis.
					</DialogDescription>
				</DialogHeader>

				{configQuery.isLoading ? (
					<div className="py-8 text-center text-sm text-tertiary-foreground">
						Loading...
					</div>
				) : configQuery.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Failed to load main Redis config</AlertTitle>
						<AlertDescription>
							{getBackendErr(configQuery.error, "Please try again")}
						</AlertDescription>
						<AlertAction>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => configQuery.refetch()}
							>
								Retry
							</Button>
						</AlertAction>
					</Alert>
				) : configQuery.data ? (
					<MainRedisCacheForm
						key={`${configQuery.data.activeInstance}:${configQuery.data.lastSuccessAt ?? "never"}`}
						config={configQuery.data}
						onSaved={() => onOpenChange(false)}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
