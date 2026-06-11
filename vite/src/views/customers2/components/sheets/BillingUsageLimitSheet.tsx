import {
	type DbUsageLimit,
	type Feature,
	FeatureType,
	type FullCustomer,
	ResetInterval,
} from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
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

// Interval is required (no inherit) and one_off windows are not supported.
const WINDOW_OPTIONS: Record<string, string> = {
	[ResetInterval.Day]: "Day",
	[ResetInterval.Week]: "Week",
	[ResetInterval.Month]: "Month",
	[ResetInterval.Year]: "Year",
};

/** Build the usage_limits entry for a windowed hard cap. */
export const buildUsageLimitItem = ({
	featureId,
	limit,
	window,
}: {
	featureId: string;
	limit: number;
	window: string;
}): DbUsageLimit => ({
	feature_id: featureId,
	limit,
	interval: window as ResetInterval,
});

export function BillingUsageLimitSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-usage-limit-edit";
	const existingItem = sheetData?.item as DbUsageLimit | undefined;
	const existingIndex = sheetData?.index as number | undefined;

	// v1: usage limits are customer-scoped only (no entity variant).
	const fullCustomer = customer as FullCustomer | undefined;

	const [isSaving, setIsSaving] = useState(false);
	const [featureId, setFeatureId] = useState(existingItem?.feature_id ?? "");
	const [usageLimit, setUsageLimit] = useState(
		existingItem?.limit?.toString() ?? "",
	);
	const [windowInterval, setWindowInterval] = useState<string>(
		existingItem?.interval ?? ResetInterval.Month,
	);

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentUsageLimits = (): DbUsageLimit[] => [
		...(fullCustomer?.usage_limits ?? []),
	];

	const saveBillingControls = async (usageLimits: DbUsageLimit[]) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		await CusService.updateCustomer({
			axios: axiosInstance,
			customer_id: customerId,
			data: { billing_controls: { usage_limits: usageLimits } },
		});
	};

	const handleSave = async () => {
		const parsedLimit =
			usageLimit.trim() === "" ? Number.NaN : Number.parseFloat(usageLimit);
		if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
			toast.error("Please enter a valid usage limit");
			return;
		}
		if (!featureId) {
			toast.error("Feature is required for a usage limit");
			return;
		}

		const item = buildUsageLimitItem({
			featureId,
			limit: parsedLimit,
			window: windowInterval,
		});

		const usageLimits = getCurrentUsageLimits();
		if (isEdit && existingIndex !== undefined) {
			usageLimits[existingIndex] = item;
		} else {
			usageLimits.push(item);
		}

		setIsSaving(true);
		try {
			await saveBillingControls(usageLimits);
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

		const usageLimits = getCurrentUsageLimits();
		usageLimits.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await saveBillingControls(usageLimits);
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
					description="Hard-cap how much of a feature can be used per window, regardless of remaining balance."
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
						<div>
							<FormLabel>Limit</FormLabel>
							<Input
								placeholder="Max usage allowed per window"
								type="number"
								value={usageLimit}
								onChange={(e) => setUsageLimit(e.target.value)}
							/>
						</div>

						<div>
							<FormLabel>Window</FormLabel>
							<Select value={windowInterval} onValueChange={setWindowInterval}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select window" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(WINDOW_OPTIONS).map(([value, label]) => (
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
