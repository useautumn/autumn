import {
	type DbUsageLimit,
	EntInterval,
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

const INTERVAL_LABELS: Partial<Record<EntInterval, string>> = {
	[EntInterval.Day]: "Day",
	[EntInterval.Week]: "Week",
	[EntInterval.Month]: "Month",
	[EntInterval.Year]: "Year",
	[EntInterval.Lifetime]: "Lifetime",
};

export function BillingUsageLimitSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-usage-limit-edit";
	const existingItem = sheetData?.item as DbUsageLimit | undefined;
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
	const [limit, setLimit] = useState(existingItem?.limit?.toString() ?? "");
	const [interval, setInterval] = useState<string>(
		existingItem?.interval ?? EntInterval.Month,
	);

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentUsageLimits = (): DbUsageLimit[] => {
		if (selectedEntity) return [...(selectedEntity.usage_limits ?? [])];
		return [...(fullCustomer?.usage_limits ?? [])];
	};

	const saveBillingControls = async (usageLimits: DbUsageLimit[]) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		if (selectedEntity) {
			await CusService.updateEntity({
				axios: axiosInstance,
				customerId,
				entityId: selectedEntity.id || selectedEntity.internal_id,
				billingControls: { usage_limits: usageLimits },
			});
		} else {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: { billing_controls: { usage_limits: usageLimits } },
			});
		}
	};

	const handleSave = async () => {
		if (!featureId) {
			toast.error("Feature is required for a usage limit");
			return;
		}
		const parsedLimit = Number.parseFloat(limit);
		if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
			toast.error("Please enter a valid limit");
			return;
		}

		const item: DbUsageLimit = {
			feature_id: featureId,
			enabled,
			limit: parsedLimit,
			interval: interval as EntInterval,
		};

		const currentUsageLimits = getCurrentUsageLimits();
		if (isEdit && existingIndex !== undefined) {
			currentUsageLimits[existingIndex] = item;
		} else {
			currentUsageLimits.push(item);
		}

		setIsSaving(true);
		try {
			await saveBillingControls(currentUsageLimits);
			await refetch();
			closeSheet();
			toast.success(isEdit ? "Usage limit updated" : "Usage limit added");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save usage limit"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (existingIndex === undefined) return;

		const currentUsageLimits = getCurrentUsageLimits();
		currentUsageLimits.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await saveBillingControls(currentUsageLimits);
			await refetch();
			closeSheet();
			toast.success("Usage limit deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete usage limit"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={isEdit ? "Edit Usage Limit" : "Add Usage Limit"}
					description="Cap how much of a feature can be used within a window, regardless of remaining balance."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					{isEdit ? (
						<div className="text-sm text-muted-foreground">
							{nonArchivedFeatures.find((f: Feature) => f.id === featureId)
								?.name ?? featureId}
						</div>
					) : (
						<FeatureSearchDropdown
							features={nonArchivedFeatures}
							value={featureId || null}
							onSelect={setFeatureId}
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
							<FormLabel>Limit</FormLabel>
							<Input
								placeholder="Max usage allowed per window"
								type="number"
								value={limit}
								onChange={(e) => setLimit(e.target.value)}
							/>
						</div>

						<div>
							<FormLabel>Window</FormLabel>
							<Select
								value={interval}
								onValueChange={setInterval}
								items={INTERVAL_LABELS as Record<string, string>}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select window" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(INTERVAL_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
							Delete usage limit
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
						disabled={!featureId}
					>
						{isEdit ? "Save" : "Add"}
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
