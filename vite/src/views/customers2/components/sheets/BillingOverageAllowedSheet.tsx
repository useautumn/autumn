import {
	type DbOverageAllowed,
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

export function BillingOverageAllowedSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-overage-allowed-edit";
	const existingItem = sheetData?.item as DbOverageAllowed | undefined;
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

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentOverageAllowed = () => {
		if (selectedEntity) return [...(selectedEntity.overage_allowed ?? [])];
		return [...(fullCustomer?.overage_allowed ?? [])];
	};

	const saveBillingControls = async ({
		overageAllowed,
	}: {
		overageAllowed: DbOverageAllowed[];
	}) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		if (selectedEntity) {
			await CusService.updateEntity({
				axios: axiosInstance,
				customerId,
				entityId: selectedEntity.id || selectedEntity.internal_id,
				billingControls: {
					overage_allowed: overageAllowed,
				},
			});
		} else {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: {
						overage_allowed: overageAllowed,
					},
				},
			});
		}
	};

	const handleSave = async () => {
		if (!featureId) {
			toast.error("Please select a feature");
			return;
		}

		const item: DbOverageAllowed = {
			feature_id: featureId,
			enabled,
		};

		const currentOverageAllowed = getCurrentOverageAllowed();

		if (isEdit && existingIndex !== undefined) {
			currentOverageAllowed[existingIndex] = item;
		} else {
			currentOverageAllowed.push(item);
		}

		setIsSaving(true);
		try {
			await saveBillingControls({ overageAllowed: currentOverageAllowed });
			await refetch();
			closeSheet();
			toast.success(
				isEdit ? "Overage allowed updated" : "Overage allowed added",
			);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save overage allowed"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (existingIndex === undefined) return;

		const currentOverageAllowed = getCurrentOverageAllowed();
		currentOverageAllowed.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await saveBillingControls({ overageAllowed: currentOverageAllowed });
			await refetch();
			closeSheet();
			toast.success("Overage allowed deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete overage allowed"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={isEdit ? "Edit Overage Allowed" : "Add Overage Allowed"}
					description="Control whether usage can exceed the granted balance for a feature."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					{isEdit ? (
						<div className="text-sm text-t2">
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

				<SheetSection withSeparator={false}>
					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Enabled</FormLabel>
						<Switch checked={enabled} onCheckedChange={setEnabled} />
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
							Delete overage allowed
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
