import {
	type DbUsageAlert,
	type Feature,
	FeatureType,
	type FullCustomer,
} from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../../customer/CustomerContext";

export function BillingUsageAlertSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-usage-alert-edit";
	const existingItem = sheetData?.item as DbUsageAlert | undefined;
	const existingIndex = sheetData?.index as number | undefined;

	const fullCustomer = customer as FullCustomer | undefined;
	const selectedEntity = entityId
		? fullCustomer?.entities?.find(
				(e) => e.id === entityId || e.internal_id === entityId,
			)
		: null;

	const [isSaving, setIsSaving] = useState(false);
	const [featureId, setFeatureId] = useState(existingItem?.feature_id ?? "");
	const [enabled, setEnabled] = useState(existingItem?.enabled ?? true);
	const [name, setName] = useState(existingItem?.name ?? "");
	const [threshold, setThreshold] = useState(
		existingItem?.threshold?.toString() ?? "",
	);
	const [thresholdType, setThresholdType] = useState<string>(
		existingItem?.threshold_type ?? "usage",
	);

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentUsageAlerts = () => {
		if (selectedEntity) return [...(selectedEntity.usage_alerts ?? [])];
		return [...(fullCustomer?.usage_alerts ?? [])];
	};

	const buildBillingControls = ({
		usageAlerts,
	}: {
		usageAlerts: DbUsageAlert[];
	}) => {
		if (selectedEntity) {
			return {
				spend_limits: selectedEntity.spend_limits,
				usage_alerts: usageAlerts,
				overage_allowed: selectedEntity.overage_allowed,
			};
		}
		return {
			auto_topups: fullCustomer?.auto_topups,
			spend_limits: fullCustomer?.spend_limits,
			usage_alerts: usageAlerts,
			overage_allowed: fullCustomer?.overage_allowed,
		};
	};

	const handleSave = async () => {
		const parsedThreshold = Number.parseFloat(threshold);
		if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
			toast.error("Please enter a valid threshold");
			return;
		}

		if (thresholdType === "usage_percentage" && parsedThreshold > 100) {
			toast.error("Percentage threshold must be between 0 and 100");
			return;
		}

		const item: DbUsageAlert = {
			feature_id: featureId || undefined,
			enabled,
			threshold: parsedThreshold,
			threshold_type: thresholdType as "usage" | "usage_percentage",
			name: name.trim() || undefined,
		};

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentUsageAlerts = getCurrentUsageAlerts();

		if (isEdit && existingIndex !== undefined) {
			currentUsageAlerts[existingIndex] = item;
		} else {
			currentUsageAlerts.push(item);
		}

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: buildBillingControls({
						usageAlerts: currentUsageAlerts,
					}),
				},
			});
			await refetch();
			closeSheet();
			toast.success(isEdit ? "Usage alert updated" : "Usage alert added");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save usage alert"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (existingIndex === undefined) return;

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentUsageAlerts = getCurrentUsageAlerts();
		currentUsageAlerts.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: buildBillingControls({
						usageAlerts: currentUsageAlerts,
					}),
				},
			});
			await refetch();
			closeSheet();
			toast.success("Usage alert deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete usage alert"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={isEdit ? "Edit Usage Alert" : "Add Usage Alert"}
					description="Configure alerts that notify when usage reaches a threshold."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					{isEdit ? (
						<div className="text-sm text-t2">
							{featureId
								? (nonArchivedFeatures.find((f: Feature) => f.id === featureId)
										?.name ?? featureId)
								: "All features"}
						</div>
					) : (
						<FeatureSearchDropdown
							features={nonArchivedFeatures}
							value={featureId || null}
							onSelect={setFeatureId}
							placeholder="Optional — leave empty for global"
						/>
					)}
				</SheetSection>

				<SheetSection withSeparator>
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Enabled</FormLabel>
							<Switch checked={enabled} onCheckedChange={setEnabled} />
						</div>

						<div>
							<FormLabel>Name</FormLabel>
							<Input
								placeholder="Optional label for this alert"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div>
							<FormLabel>Threshold type</FormLabel>
							<Select value={thresholdType} onValueChange={setThresholdType}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="usage">Absolute usage</SelectItem>
									<SelectItem value="usage_percentage">
										Percentage of allowance
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div>
							<FormLabel>
								Threshold
								{thresholdType === "usage_percentage" ? " (%)" : ""}
							</FormLabel>
							<Input
								placeholder={
									thresholdType === "usage_percentage" ? "eg, 80" : "eg, 1000"
								}
								type="number"
								value={threshold}
								onChange={(e) => setThreshold(e.target.value)}
							/>
						</div>
					</div>
				</SheetSection>

				<div className="flex-1" />

				{isEdit && (
					<div className="px-4 pb-2">
						<Button
							variant="ghost"
							className="text-destructive hover:text-destructive w-full"
							onClick={handleDelete}
							disabled={isSaving}
						>
							Delete usage alert
						</Button>
					</div>
				)}

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleSave}
						isLoading={isSaving}
					>
						{isEdit ? "Save" : "Add"}
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
