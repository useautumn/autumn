import {
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
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const INSTANCE_OPTIONS = [
	{
		value: "upstash",
		label: "Upstash",
		description: "CACHE_V2_UPSTASH_URL (or CACHE_URL fallback)",
	},
	{
		value: "redis",
		label: "Redis",
		description: "CACHE_V2_REDIS_URL",
	},
	{
		value: "dragonfly",
		label: "Dragonfly",
		description: "CACHE_V2_DRAGONFLY_URL",
	},
] as const;

type InstanceName = (typeof INSTANCE_OPTIONS)[number]["value"];

type RedisV2CacheConfig = {
	activeInstance: InstanceName;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: RedisV2CacheConfig = {
	activeInstance: "upstash",
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export function RedisV2CacheDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<RedisV2CacheConfig>(DEFAULT_CONFIG);
	const [selected, setSelected] = useState<InstanceName>("upstash");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<RedisV2CacheConfig>("/admin/redis-v2-cache-config")
			.then(({ data }) => {
				if (cancelled) return;
				const merged = { ...DEFAULT_CONFIG, ...data };
				setConfig(merged);
				setSelected(merged.activeInstance);
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(
						getBackendErr(error, "Failed to load redis v2 cache config"),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	const handleSave = async () => {
		setSaving(true);
		try {
			await axiosInstance.put("/admin/redis-v2-cache-config", {
				activeInstance: selected,
			});
			toast.success(`Active V2 Redis set to "${selected}"`);
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save redis v2 cache config"));
		} finally {
			setSaving(false);
		}
	};

	const dirty = selected !== config.activeInstance;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle>V2 Redis Instance</DialogTitle>
					<DialogDescription>
						Switch the active Redis instance used for V2 cache reads and writes.
						Change propagates to all servers, workers, and cron jobs within ~10
						seconds.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-tertiary-foreground">
						Loading...
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
								Active Instance
							</div>
							<Select
								value={selected}
								onValueChange={(value) => setSelected(value as InstanceName)}
								items={Object.fromEntries(
									INSTANCE_OPTIONS.map((option) => [
										option.value,
										option.label,
									]),
								)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{INSTANCE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
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
								</SelectContent>
							</Select>
							<div className="text-xs text-tertiary-foreground">
								Currently active:{" "}
								<span className="font-mono text-foreground">
									{config.activeInstance}
								</span>
							</div>
						</div>

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
									? "S3 redis v2 cache config is not configured."
									: config.error ||
										"Instance switches propagate within ~10 seconds."}
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
