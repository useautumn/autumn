import {
	AppEnv,
	type DbUsageAlert,
	type Feature,
	type FrontendOrg,
	type OrgConfig,
} from "@autumn/shared";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { OrgUsageAlertDialog } from "./OrgUsageAlertDialog";

const pillClassName =
	"rounded-md bg-muted px-1.5 py-0.5 text-xs text-tertiary-foreground whitespace-nowrap";

const thresholdTypeLabel: Record<DbUsageAlert["threshold_type"], string> = {
	usage: "absolute usage",
	usage_percentage: "% used of allowance",
	remaining: "absolute remaining",
	remaining_percentage: "% remaining of allowance",
};

const formatThreshold = (alert: DbUsageAlert) => {
	const isPct =
		alert.threshold_type === "usage_percentage" ||
		alert.threshold_type === "remaining_percentage";
	return isPct ? `${alert.threshold}%` : alert.threshold.toLocaleString();
};

type OrgUsageAlertsConfigKey = "usage_alerts" | "sandbox_usage_alerts";

const getUsageAlertsConfigKey = (env: AppEnv): OrgUsageAlertsConfigKey =>
	env === AppEnv.Sandbox ? "sandbox_usage_alerts" : "usage_alerts";

interface DialogState {
	open: boolean;
	editingIndex: number | null;
}

export const OrgUsageAlertsSubsection = () => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const env = useEnv();
	const orgQueryKey = ["org", env];
	const usageAlertsConfigKey = getUsageAlertsConfigKey(env);

	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		editingIndex: null,
	});

	const orgAlerts: DbUsageAlert[] = useMemo(
		() => org?.config?.[usageAlertsConfigKey] ?? [],
		[org?.config, usageAlertsConfigKey],
	);

	const featureNameById = useMemo(
		() => new Map((features ?? []).map((f: Feature) => [f.id, f.name])),
		[features],
	);

	const { mutateAsync, isPending } = useMutation({
		mutationFn: async (updatedAlerts: DbUsageAlert[]) => {
			const { data } = await axiosInstance.patch("/organization/config", {
				[usageAlertsConfigKey]: updatedAlerts,
			});
			return data as { config: OrgConfig };
		},
		onSuccess: (data) => {
			queryClient.setQueryData<FrontendOrg>(orgQueryKey, (old) =>
				old ? { ...old, config: data.config } : old,
			);
		},
		onError: () => {
			toast.error("Failed to update usage alerts");
			queryClient.invalidateQueries({ queryKey: orgQueryKey });
		},
	});

	const handleAddClick = () => setDialog({ open: true, editingIndex: null });

	const handleEditClick = (index: number) =>
		setDialog({ open: true, editingIndex: index });

	const handleDialogOpenChange = (open: boolean) => {
		if (!open) setDialog({ open: false, editingIndex: null });
	};

	const handleSubmit = async (alert: DbUsageAlert) => {
		const next = [...orgAlerts];
		if (dialog.editingIndex !== null) {
			next[dialog.editingIndex] = alert;
		} else {
			next.push(alert);
		}

		try {
			await mutateAsync(next);
			setDialog({ open: false, editingIndex: null });
			toast.success(
				dialog.editingIndex !== null
					? "Usage alert updated"
					: "Usage alert added",
			);
		} catch {
			// onError handles toast + invalidate
		}
	};

	const handleDelete = async (index: number) => {
		const next = orgAlerts.filter((_, i) => i !== index);
		try {
			await mutateAsync(next);
			toast.success("Usage alert removed");
		} catch {
			// onError handles toast + invalidate
		}
	};

	const editingAlert =
		dialog.editingIndex !== null ? orgAlerts[dialog.editingIndex] : undefined;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-end">
				<Button
					variant="secondary"
					size="mini"
					className="gap-2 font-medium shrink-0"
					onClick={handleAddClick}
				>
					<PlusIcon className="size-3.5" />
					Add alert
				</Button>
			</div>

			{orgAlerts.length === 0 ? (
				<div className="rounded-lg border border-dashed bg-interactive-secondary px-3 py-4 text-center text-xs text-tertiary-foreground">
					No org-level usage alerts configured.
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					{orgAlerts.map((alert, index) => (
						<div
							key={`org-alert-${alert.feature_id ?? "global"}-${alert.threshold_type}-${alert.threshold}-${alert.name ?? index}`}
							className={cn(
								"flex items-center gap-2 rounded-lg border bg-interactive-secondary px-3 py-2 min-w-0",
							)}
						>
							<button
								type="button"
								className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
								onClick={() => handleEditClick(index)}
							>
								<span
									className={cn(
										"shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium",
										alert.enabled
											? "bg-green-500/10 text-green-600"
											: "bg-muted text-tertiary-foreground",
									)}
								>
									{alert.enabled ? "Enabled" : "Disabled"}
								</span>
								<span className="truncate text-sm font-medium">
									{alert.feature_id
										? (featureNameById.get(alert.feature_id) ??
											alert.feature_id)
										: "All features"}
								</span>
								{alert.name && (
									<span className="truncate text-xs text-tertiary-foreground font-mono ml-2">
										{alert.name}
									</span>
								)}
								<div className="ml-auto flex items-center gap-1.5 shrink-0">
									<span className={pillClassName}>
										At: {formatThreshold(alert)}
									</span>
									<span className={cn(pillClassName, "hidden sm:inline")}>
										{thresholdTypeLabel[alert.threshold_type]}
									</span>
								</div>
							</button>
							<Button
								variant="ghost"
								size="mini"
								className="text-destructive hover:text-destructive shrink-0"
								onClick={() => handleDelete(index)}
								disabled={isPending}
							>
								<TrashIcon className="size-3.5" />
							</Button>
						</div>
					))}
				</div>
			)}

			{dialog.open && (
				<OrgUsageAlertDialog
					open={dialog.open}
					onOpenChange={handleDialogOpenChange}
					features={features ?? []}
					initialAlert={editingAlert}
					onSubmit={handleSubmit}
					isSaving={isPending}
				/>
			)}
		</div>
	);
};
