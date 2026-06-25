import {
	type DbSpendLimit,
	type Feature,
	FeatureType,
	type FullCustomer,
	type SpendLimitType,
} from "@autumn/shared";
import { Button, FormLabel, Input, Switch } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
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

const LIMIT_TYPE_LABELS: Record<SpendLimitType, string> = {
	absolute: "Absolute",
	usage_percentage: "Usage %",
};

export function BillingSpendLimitSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-spend-limit-edit";
	const existingItem = sheetData?.item as DbSpendLimit | undefined;
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
	const [overageLimit, setOverageLimit] = useState(
		existingItem?.overage_limit?.toString() ?? "",
	);
	const [limitType, setLimitType] = useState<SpendLimitType>(
		existingItem?.limit_type ?? "absolute",
	);

	const isUsagePercentage = limitType === "usage_percentage";

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentSpendLimits = () => {
		if (selectedEntity) return [...(selectedEntity.spend_limits ?? [])];
		return [...(fullCustomer?.spend_limits ?? [])];
	};

	const saveBillingControls = async ({
		spendLimits,
	}: {
		spendLimits: DbSpendLimit[];
	}) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		if (selectedEntity) {
			await CusService.updateEntity({
				axios: axiosInstance,
				customerId,
				entityId: selectedEntity.id || selectedEntity.internal_id,
				billingControls: {
					spend_limits: spendLimits,
				},
			});
		} else {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: {
						spend_limits: spendLimits,
					},
				},
			});
		}
	};

	const handleSave = async () => {
		const parsedOverageLimit =
			overageLimit.trim() === "" ? undefined : Number.parseFloat(overageLimit);

		// A spend limit only applies to a specific feature; without one it is
		// silently ignored server-side.
		if (!featureId) {
			toast.error("Feature is required for a spend limit");
			return;
		}

		if (parsedOverageLimit !== undefined) {
			if (Number.isNaN(parsedOverageLimit) || parsedOverageLimit < 0) {
				toast.error("Please enter a valid overage limit");
				return;
			}
		}

		const item = {
			feature_id: featureId || undefined,
			enabled,
			overage_limit: parsedOverageLimit,
			limit_type: limitType,
		} satisfies DbSpendLimit;

		const currentSpendLimits = getCurrentSpendLimits();

		if (isEdit && existingIndex !== undefined) {
			currentSpendLimits[existingIndex] = item;
		} else {
			currentSpendLimits.push(item);
		}

		setIsSaving(true);
		try {
			await saveBillingControls({ spendLimits: currentSpendLimits });
			await refetch();
			closeSheet();
			toast.success(isEdit ? "Spend limit updated" : "Spend limit added");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save spend limit"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (existingIndex === undefined) return;

		const currentSpendLimits = getCurrentSpendLimits();
		currentSpendLimits.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await saveBillingControls({ spendLimits: currentSpendLimits });
			await refetch();
			closeSheet();
			toast.success("Spend limit deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete spend limit"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={isEdit ? "Edit Spend Limit" : "Add Spend Limit"}
					description="Set an overage spend limit for a feature or globally."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					{isEdit ? (
						<div className="text-sm text-muted-foreground">
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
							<FormLabel>Limit type</FormLabel>
							<Select
								value={limitType}
								onValueChange={(value) => {
									// Clear the amount: units and percent aren't interchangeable.
									setLimitType(value as SpendLimitType);
									setOverageLimit("");
								}}
								items={LIMIT_TYPE_LABELS}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="absolute">
										{LIMIT_TYPE_LABELS.absolute}
									</SelectItem>
									<SelectItem value="usage_percentage">
										{LIMIT_TYPE_LABELS.usage_percentage}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div>
							<FormLabel>
								{isUsagePercentage ? "Overage limit (%)" : "Overage limit"}
							</FormLabel>
							<Input
								placeholder={
									isUsagePercentage
										? "eg, 120"
										: "Optional — leave empty for no limit"
								}
								type="number"
								value={overageLimit}
								onChange={(e) => setOverageLimit(e.target.value)}
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
							Delete spend limit
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
