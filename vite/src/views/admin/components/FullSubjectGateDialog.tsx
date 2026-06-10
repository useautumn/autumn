import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
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
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type FullSubjectGateConfig = {
	per_customer_limit: number;
	per_org_limit: number;
	max_wait_ms: number;
	per_customer_pending_max: number;
	per_org_pending_max: number;
	critical_db_admission_enabled: boolean;
	critical_db_share: number;
	critical_db_reserve: number;
	configHealthy?: boolean;
	configConfigured?: boolean;
	lastSuccessAt?: string | null;
	error?: string | null;
};

const DEFAULT_CONFIG: FullSubjectGateConfig = {
	per_customer_limit: 200,
	per_org_limit: 500,
	max_wait_ms: 2_000,
	per_customer_pending_max: 500,
	per_org_pending_max: 1_000,
	critical_db_admission_enabled: false,
	critical_db_share: 0.7,
	critical_db_reserve: 2,
};

const FIELDS: Array<{
	key: keyof Pick<
		FullSubjectGateConfig,
		| "per_customer_limit"
		| "per_org_limit"
		| "max_wait_ms"
		| "per_customer_pending_max"
		| "per_org_pending_max"
	>;
	label: string;
	description: string;
	min: number;
	max: number;
}> = [
	{
		key: "per_customer_limit",
		label: "Per-customer concurrent limit",
		description:
			"Max DB hydrations in flight at once for a single (org, env, customer). Per process — multiply by replica count for cluster-wide cap.",
		min: 1,
		max: 10_000,
	},
	{
		key: "per_org_limit",
		label: "Per-org concurrent limit",
		description:
			"Max DB hydrations in flight at once for a single (org, env). Per process.",
		min: 1,
		max: 10_000,
	},
	{
		key: "max_wait_ms",
		label: "Max queue wait (ms)",
		description:
			"Reject with 429 if a queued request waits longer than this before its slot opens.",
		min: 100,
		max: 60_000,
	},
	{
		key: "per_customer_pending_max",
		label: "Per-customer queue depth cap",
		description:
			"Reject with 429 before queueing if the per-customer pending count is at or above this. Bounds heap memory + worst-case wait.",
		min: 1,
		max: 100_000,
	},
	{
		key: "per_org_pending_max",
		label: "Per-org queue depth cap",
		description:
			"Reject with 429 before queueing if the per-org pending count is at or above this.",
		min: 1,
		max: 100_000,
	},
];

const RESERVE_MIN = 0;
const RESERVE_MAX = 1_000;
const SHARE_MIN = 0.1;
const SHARE_MAX = 1;

export function FullSubjectGateDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<FullSubjectGateConfig>(DEFAULT_CONFIG);
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<FullSubjectGateConfig>("/admin/full-subject-gate-config")
			.then(({ data }) => {
				if (cancelled) return;
				const merged: FullSubjectGateConfig = { ...DEFAULT_CONFIG, ...data };
				setConfig(merged);
				const initialDrafts: Record<string, string> = {};
				for (const field of FIELDS) {
					initialDrafts[field.key] = String(merged[field.key]);
				}
				initialDrafts.critical_db_share = String(merged.critical_db_share);
				initialDrafts.critical_db_reserve = String(merged.critical_db_reserve);
				setDrafts(initialDrafts);
			})
			.catch((error) => {
				if (!cancelled)
					toast.error(
						getBackendErr(error, "Failed to load FullSubject gate config"),
					);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	const handleSave = async () => {
		const next: Record<string, number | boolean> = {};
		for (const field of FIELDS) {
			const parsed = Number(drafts[field.key]);
			if (
				!Number.isInteger(parsed) ||
				parsed < field.min ||
				parsed > field.max
			) {
				toast.error(
					`${field.label} must be an integer between ${field.min} and ${field.max}`,
				);
				return;
			}
			next[field.key] = parsed;
		}

		const share = Number(drafts.critical_db_share);
		if (Number.isNaN(share) || share < SHARE_MIN || share > SHARE_MAX) {
			toast.error(
				`Critical DB share must be a number between ${SHARE_MIN} and ${SHARE_MAX}`,
			);
			return;
		}

		const reserve = Number(drafts.critical_db_reserve);
		if (
			!Number.isInteger(reserve) ||
			reserve < RESERVE_MIN ||
			reserve > RESERVE_MAX
		) {
			toast.error(
				`Critical DB reserve must be an integer between ${RESERVE_MIN} and ${RESERVE_MAX}`,
			);
			return;
		}

		next.critical_db_share = share;
		next.critical_db_reserve = reserve;
		next.critical_db_admission_enabled = config.critical_db_admission_enabled;

		setSaving(true);
		try {
			await axiosInstance.put("/admin/full-subject-gate-config", next);
			toast.success("FullSubject gate config updated (takes effect in ≤30s)");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update gate config"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>FullSubject Concurrency Gate</DialogTitle>
					<DialogDescription>
						Cluster-wide caps on concurrent FullSubject DB hydrations. Changes
						take effect within ~30s on all replicas, no redeploy required.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-tertiary-foreground">
						Loading…
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-2 text-xs">
							<Badge variant={config.configHealthy ? "success" : "warning"}>
								{config.configHealthy ? "Healthy" : "Unhealthy"}
							</Badge>
							<Badge variant={config.configConfigured ? "info" : "secondary"}>
								{config.configConfigured ? "S3 set" : "Using defaults"}
							</Badge>
							{config.lastSuccessAt && (
								<span className="text-tertiary-foreground">
									Last sync: {new Date(config.lastSuccessAt).toLocaleString()}
								</span>
							)}
							{config.error && (
								<span className="text-destructive">{config.error}</span>
							)}
						</div>

						{FIELDS.map((field) => (
							<div key={field.key} className="flex flex-col gap-1">
								<FormLabel>{field.label}</FormLabel>
								<div className="flex items-center gap-3">
									<Input
										type="number"
										min={field.min}
										max={field.max}
										value={drafts[field.key] ?? ""}
										onChange={(e) =>
											setDrafts((prev) => ({
												...prev,
												[field.key]: e.target.value,
											}))
										}
										className="w-32 font-mono text-xs"
									/>
									<span className="text-xs text-tertiary-foreground">
										{field.description}
									</span>
								</div>
							</div>
						))}

						<div className="mt-1 flex flex-col gap-3 border-t border-border pt-4">
							<div className="flex flex-col gap-1">
								<FormLabel>Critical DB admission</FormLabel>
								<span className="text-xs text-tertiary-foreground">
									Separate from the hydration caps above: connection-aware
									shedding on the critical pg pool for read/establish routes
									(get_or_create, entities.get, GET customer). Sheds 503 with
									Retry-After before max_client_conn exhausts (08P01 5xx).
								</span>
							</div>

							<div className="flex items-center gap-3">
								<Switch
									checked={config.critical_db_admission_enabled}
									onCheckedChange={(checked) =>
										setConfig((prev) => ({
											...prev,
											critical_db_admission_enabled: checked,
										}))
									}
								/>
								<span className="text-xs text-tertiary-foreground">
									{config.critical_db_admission_enabled
										? "Enabled — read/establish routes shed 503 when the critical pool is saturated."
										: "Disabled — no admission control (read/establish routes 5xx on pool exhaustion)."}
								</span>
							</div>

							<div className="flex flex-col gap-1">
								<FormLabel>Critical DB share</FormLabel>
								<div className="flex items-center gap-3">
									<Input
										type="number"
										min={SHARE_MIN}
										max={SHARE_MAX}
										step={0.1}
										value={drafts.critical_db_share ?? ""}
										onChange={(e) =>
											setDrafts((prev) => ({
												...prev,
												critical_db_share: e.target.value,
											}))
										}
										className="w-32 font-mono text-xs"
									/>
									<span className="text-xs text-tertiary-foreground">
										Fraction (0.1–1) of the critical pool admitted requests may
										use. Per-process limit = floor(poolMax × share) − reserve.
									</span>
								</div>
							</div>

							<div className="flex flex-col gap-1">
								<FormLabel>Critical DB reserve</FormLabel>
								<div className="flex items-center gap-3">
									<Input
										type="number"
										min={RESERVE_MIN}
										max={RESERVE_MAX}
										value={drafts.critical_db_reserve ?? ""}
										onChange={(e) =>
											setDrafts((prev) => ({
												...prev,
												critical_db_reserve: e.target.value,
											}))
										}
										className="w-32 font-mono text-xs"
									/>
									<span className="text-xs text-tertiary-foreground">
										Connections held back below the share as headroom. Higher =
										sheds sooner.
									</span>
								</div>
							</div>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={loading || saving}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
