import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Switch } from "@/components/ui/switch";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type QueueEntry = {
	enabled: boolean;
};

type KnownQueue = {
	id: string;
	label: string;
	description: string;
	defaultEnabled: boolean;
};

type JobQueueConfig = {
	queues: Record<string, QueueEntry>;
	knownQueues: KnownQueue[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: JobQueueConfig = {
	queues: {},
	knownQueues: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export function JobQueuesDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<JobQueueConfig>(DEFAULT_CONFIG);
	const [initialEnabledByQueue, setInitialEnabledByQueue] = useState<
		Record<string, boolean>
	>({});

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<JobQueueConfig>("/admin/job-queue-config")
			.then(({ data }) => {
				if (cancelled) return;
				const nextConfig = { ...DEFAULT_CONFIG, ...data };
				setConfig(nextConfig);
				setInitialEnabledByQueue(
					Object.fromEntries(
						nextConfig.knownQueues.map((queue) => [
							queue.id,
							nextConfig.queues[queue.id]?.enabled ?? queue.defaultEnabled,
						]),
					),
				);
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(getBackendErr(error, "Failed to load job queue config"));
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	const effectiveQueues = useMemo(
		() =>
			config.knownQueues.map((queue) => ({
				...queue,
				enabled:
					config.queues[queue.id]?.enabled ?? queue.defaultEnabled,
			})),
		[config],
	);

	const toggleQueue = ({
		queueId,
		enabled,
	}: {
		queueId: string;
		enabled: boolean;
	}) => {
		setConfig((current) => ({
			...current,
			queues: {
				...current.queues,
				[queueId]: { enabled },
			},
		}));
	};

	const dirty = effectiveQueues.some(
		(queue) => queue.enabled !== initialEnabledByQueue[queue.id],
	);

	const handleSave = async () => {
		setSaving(true);
		try {
			await axiosInstance.put("/admin/job-queue-config", {
				queues: Object.fromEntries(
					effectiveQueues.map((queue) => [
						queue.id,
						{ enabled: queue.enabled },
					]),
				),
			});
			toast.success("Job queue config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save job queue config"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle>Job Queues</DialogTitle>
					<DialogDescription>
						Control which SQS queues workers actively poll. Disabling a queue
						pauses consumption without changing producers.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-t3">Loading...</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-3">
							{effectiveQueues.map((queue) => (
								<div
									key={queue.id}
									className="flex items-center justify-between rounded-lg border border-border p-3"
								>
									<div className="flex flex-col gap-0.5 pr-4">
										<div className="text-sm font-medium text-t1">
											{queue.label}
										</div>
										<div className="text-xs text-t3">
											{queue.description}
										</div>
										<div className="text-[11px] text-t3">
											Default: {queue.defaultEnabled ? "enabled" : "disabled"}
										</div>
									</div>
									<Switch
										checked={queue.enabled}
										onCheckedChange={(enabled) =>
											toggleQueue({ queueId: queue.id, enabled })
										}
									/>
								</div>
							))}
						</div>

						<div className="rounded-lg border border-border p-3 text-xs text-t3">
							<div className="mb-2 flex items-center gap-2">
								<Badge
									variant="muted"
									className={
										config.configHealthy
											? "border-emerald-200 bg-emerald-50 text-emerald-700"
											: "border-amber-200 bg-amber-50 text-amber-700"
									}
								>
									{config.configHealthy
										? "Config healthy"
										: "Config unavailable"}
								</Badge>
								{config.lastSuccessAt && (
									<span>
										Last refresh:{" "}
										{new Date(config.lastSuccessAt).toLocaleString()}
									</span>
								)}
							</div>
							<div>
								{config.configConfigured === false
									? "S3 job queue config is not configured."
									: config.error ||
										"Queue polling changes propagate to workers within ~60 seconds."}
							</div>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSave}
						isLoading={saving}
						disabled={loading || !dirty}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
