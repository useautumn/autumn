import {
	type DbSpendLimit,
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

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentSpendLimits = () => {
		if (selectedEntity) return [...(selectedEntity.spend_limits ?? [])];
		return [...(fullCustomer?.spend_limits ?? [])];
	};

	const buildBillingControls = ({
		spendLimits,
	}: {
		spendLimits: DbSpendLimit[];
	}) => {
		if (selectedEntity) {
			return {
				spend_limits: spendLimits,
				usage_alerts: selectedEntity.usage_alerts,
				overage_allowed: selectedEntity.overage_allowed,
			};
		}
		return {
			auto_topups: fullCustomer?.auto_topups,
			spend_limits: spendLimits,
			usage_alerts: fullCustomer?.usage_alerts,
			overage_allowed: fullCustomer?.overage_allowed,
		};
	};

	const handleSave = async () => {
		const parsedOverageLimit =
			overageLimit.trim() === "" ? undefined : Number.parseFloat(overageLimit);

		if (parsedOverageLimit !== undefined) {
			if (Number.isNaN(parsedOverageLimit) || parsedOverageLimit < 0) {
				toast.error("Please enter a valid overage limit");
				return;
			}
			if (!featureId) {
				toast.error("Feature is required when overage limit is set");
				return;
			}
		}

		const item: DbSpendLimit = {
			feature_id: featureId || undefined,
			enabled,
			overage_limit: parsedOverageLimit,
		};

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentSpendLimits = getCurrentSpendLimits();

		if (isEdit && existingIndex !== undefined) {
			currentSpendLimits[existingIndex] = item;
		} else {
			currentSpendLimits.push(item);
		}

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: buildBillingControls({
						spendLimits: currentSpendLimits,
					}),
				},
			});
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

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentSpendLimits = getCurrentSpendLimits();
		currentSpendLimits.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: buildBillingControls({
						spendLimits: currentSpendLimits,
					}),
				},
			});
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
							<FormLabel>Overage limit</FormLabel>
							<Input
								placeholder="Optional — leave empty for no limit"
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
