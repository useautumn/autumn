import {
	type DbUsageAlert,
	DEFAULT_USAGE_ALERT_BASIS,
	type FullCustomer,
} from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { CubeIcon, FunnelSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { getFeatureLabel } from "@/components/billing-controls/BillingControlsDisplay";
import type { BillingControlOrigin } from "@/components/billing-controls/resolveDisplayedBillingControls";
import { USAGE_ALERT_BASIS_LABELS } from "@/components/billing-controls/usageAlertBasisOptions";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useDisplayedBillingControls } from "../useDisplayedBillingControls";

type FeatureAlert = {
	alert: DbUsageAlert;
	origin: BillingControlOrigin | undefined;
};

const thresholdLabel = (alert: DbUsageAlert) =>
	alert.threshold_type === "usage_percentage" ||
	alert.threshold_type === "remaining_percentage"
		? `${alert.threshold}%`
		: alert.threshold.toLocaleString();

const alertDescription = (alert: DbUsageAlert) => {
	const basis =
		USAGE_ALERT_BASIS_LABELS[
			alert.basis ?? DEFAULT_USAGE_ALERT_BASIS
		].toLowerCase();
	switch (alert.threshold_type) {
		case "usage_percentage":
			return `used of ${basis}`;
		case "remaining_percentage":
			return `left of ${basis}`;
		case "remaining":
			return `left of ${basis}`;
		default:
			return `used of ${basis}`;
	}
};

const filterText = (alert: DbUsageAlert) =>
	Object.entries(alert.filter?.properties ?? {})
		.map(([key, value]) => `${key} = ${value}`)
		.join(", ");

export function BillingUsageAlertsFeatureSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const {
		billingControls,
		origins,
		fullCustomer,
		selectedEntity,
		featureNameById,
		refetch,
	} = useDisplayedBillingControls();
	const [isSaving, setIsSaving] = useState(false);

	const featureId = (sheetData?.featureId as string | null) ?? undefined;
	const featureName = getFeatureLabel({ featureId, featureNameById });
	const returnTo = {
		type: "billing-usage-alerts-feature" as const,
		data: { featureId: featureId ?? null },
	};

	const featureAlerts: FeatureAlert[] = (billingControls.usage_alerts ?? [])
		.map((alert, index) => ({ alert, origin: origins.usage_alerts?.[index] }))
		.filter(({ alert }) => alert.feature_id === featureId);
	const planAlerts = featureAlerts.filter(
		({ origin }) => origin?.type === "plan",
	);
	const planName =
		planAlerts[0]?.origin?.type === "plan"
			? planAlerts[0].origin.planName
			: undefined;

	const ownAlerts = (): DbUsageAlert[] => [
		...((selectedEntity ?? (fullCustomer as FullCustomer | undefined))
			?.usage_alerts ?? []),
	];

	const saveUsageAlerts = async ({
		usageAlerts,
		successMessage,
	}: {
		usageAlerts: DbUsageAlert[];
		successMessage: string;
	}) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		setIsSaving(true);
		try {
			if (selectedEntity) {
				await CusService.updateEntity({
					axios: axiosInstance,
					customerId,
					entityId: selectedEntity.id || selectedEntity.internal_id,
					billingControls: { usage_alerts: usageAlerts },
				});
			} else {
				await CusService.updateCustomer({
					axios: axiosInstance,
					customer_id: customerId,
					data: { billing_controls: { usage_alerts: usageAlerts } },
				});
			}
			await refetch();
			toast.success(successMessage);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save usage alerts"));
		} finally {
			setIsSaving(false);
		}
	};

	const toggleAlert = ({
		index,
		enabled,
	}: {
		index: number;
		enabled: boolean;
	}) => {
		const usageAlerts = ownAlerts();
		usageAlerts[index] = { ...usageAlerts[index], enabled };
		return saveUsageAlerts({
			usageAlerts,
			successMessage: enabled
				? "Usage alert turned on"
				: "Usage alert turned off",
		});
	};

	// Own alerts for a feature replace every plan alert for it, so copy the full set.
	const customizePlanAlerts = () =>
		saveUsageAlerts({
			usageAlerts: [
				...ownAlerts(),
				...planAlerts.map(({ alert }) => ({ ...alert })),
			],
			successMessage: "Plan alerts copied to this customer",
		});

	const openEdit = ({ index, alert }: { index: number; alert: DbUsageAlert }) =>
		setSheet({
			type: "billing-usage-alert-edit",
			data: { index, item: alert, returnTo },
		});

	const openAdd = () =>
		setSheet({
			type: "billing-usage-alert-add",
			data: {
				...(featureId && { item: { feature_id: featureId } }),
				returnTo,
			},
		});

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Usage alerts"
					description={`${featureName} · ${featureAlerts.length} ${
						featureAlerts.length === 1 ? "alert" : "alerts"
					}`}
				/>

				{planAlerts.length > 0 && (
					<SheetSection withSeparator>
						<div className="flex flex-col gap-2">
							<p className="text-sm text-tertiary-foreground">
								These alerts come from {planName}. Customizing copies all of
								them to this {selectedEntity ? "entity" : "customer"}, and they
								replace the plan's alerts for {featureName}.
							</p>
							<Button
								variant="secondary"
								size="sm"
								className="self-start"
								isLoading={isSaving}
								onClick={customizePlanAlerts}
							>
								Customize alerts
							</Button>
						</div>
					</SheetSection>
				)}

				<SheetSection withSeparator={false}>
					<div className="flex flex-col gap-2">
						{featureAlerts.map(({ alert, origin }) => {
							const isPlan = origin?.type === "plan";
							const ownIndex = origin?.type === "own" ? origin.index : null;
							const filter = filterText(alert);
							return (
								<div
									key={`${origin?.type}-${ownIndex ?? alert.threshold}-${alert.threshold_type}-${alert.basis}`}
									className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
								>
									<button
										type="button"
										disabled={ownIndex === null}
										className={cn(
											"flex min-w-0 flex-1 items-center gap-3 text-left",
											ownIndex !== null && "cursor-pointer",
											!alert.enabled && "opacity-50",
										)}
										onClick={() =>
											ownIndex !== null && openEdit({ index: ownIndex, alert })
										}
									>
										<span className="w-14 shrink-0 text-base font-semibold text-foreground">
											{thresholdLabel(alert)}
										</span>
										<span className="flex min-w-0 flex-col gap-0.5">
											<span className="truncate text-sm text-foreground">
												{alert.name || alertDescription(alert)}
											</span>
											{(isPlan || filter || alert.name) && (
												<span className="flex items-center gap-1 truncate text-xs text-tertiary-foreground">
													{isPlan && (
														<CubeIcon
															className="size-3 shrink-0 text-violet-500"
															weight="duotone"
														/>
													)}
													{filter && (
														<FunnelSimpleIcon className="size-3 shrink-0" />
													)}
													{[
														isPlan && origin?.type === "plan"
															? `From ${origin.planName}`
															: null,
														alert.name ? alertDescription(alert) : null,
														filter ? `where ${filter}` : null,
													]
														.filter(Boolean)
														.join(" · ")}
												</span>
											)}
										</span>
									</button>
									{ownIndex !== null && (
										<Switch
											checked={alert.enabled}
											disabled={isSaving}
											onCheckedChange={(enabled) =>
												toggleAlert({ index: ownIndex, enabled })
											}
										/>
									)}
								</div>
							);
						})}

						{planAlerts.length === 0 && (
							<button
								type="button"
								className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-tertiary-foreground hover:text-foreground"
								onClick={openAdd}
							>
								<PlusIcon className="size-3.5" />
								Add alert for {featureName}
							</button>
						)}
					</div>
				</SheetSection>

				<div className="flex-1" />

				<SheetFooter>
					<Button
						variant="secondary"
						className="col-span-2 w-full"
						onClick={closeSheet}
					>
						Done
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
