import {
	type DbSpendLimit,
	EntInterval,
	type Feature,
	FeatureType,
	type FullCustomer,
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
import { useCustomerContext } from "../../customer/CustomerContext";

// The empty value means "inherit the feature entitlement's reset interval"
// (usage_limit_interval omitted -> backend defaults to the billing cycle).
export const INHERIT_WINDOW = "inherit";

const WINDOW_OPTIONS: Record<string, string> = {
	[INHERIT_WINDOW]: "Inherit (billing cycle)",
	[EntInterval.Day]: "Day",
	[EntInterval.Week]: "Week",
	[EntInterval.Month]: "Month",
	[EntInterval.Year]: "Year",
};

/**
 * Build the spend_limit entry for a usage cap. The cap is folded into spend_limits
 * (presence of usage_limit arms it); window === INHERIT_WINDOW omits the interval so
 * the backend inherits the entitlement's reset interval. Any co-located overage limit
 * on an edited entry is preserved.
 */
export const buildUsageLimitItem = ({
	existing,
	featureId,
	usageLimit,
	window,
}: {
	existing?: DbSpendLimit;
	featureId: string;
	usageLimit: number;
	window: string;
}): DbSpendLimit => ({
	...existing,
	feature_id: featureId || undefined,
	enabled: existing?.enabled ?? false,
	usage_limit: usageLimit,
	usage_limit_interval:
		window === INHERIT_WINDOW ? undefined : (window as EntInterval),
});

export function BillingUsageLimitSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { features } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-usage-limit-edit";
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
	const [usageLimit, setUsageLimit] = useState(
		existingItem?.usage_limit?.toString() ?? "",
	);
	const [windowInterval, setWindowInterval] = useState<string>(
		existingItem?.usage_limit_interval ?? INHERIT_WINDOW,
	);

	const nonArchivedFeatures = (features ?? []).filter(
		(f: Feature) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const getCurrentSpendLimits = (): DbSpendLimit[] => {
		if (selectedEntity) return [...(selectedEntity.spend_limits ?? [])];
		return [...(fullCustomer?.spend_limits ?? [])];
	};

	const saveBillingControls = async (spendLimits: DbSpendLimit[]) => {
		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		if (selectedEntity) {
			await CusService.updateEntity({
				axios: axiosInstance,
				customerId,
				entityId: selectedEntity.id || selectedEntity.internal_id,
				billingControls: { spend_limits: spendLimits },
			});
		} else {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: { billing_controls: { spend_limits: spendLimits } },
			});
		}
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
			existing: existingItem,
			featureId,
			usageLimit: parsedLimit,
			window: windowInterval,
		});

		const spendLimits = getCurrentSpendLimits();
		if (isEdit && existingIndex !== undefined) {
			spendLimits[existingIndex] = item;
		} else {
			spendLimits.push(item);
		}

		setIsSaving(true);
		try {
			await saveBillingControls(spendLimits);
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

		const spendLimits = getCurrentSpendLimits();
		const existing = spendLimits[existingIndex];
		// Preserve a co-located overage limit; otherwise drop the entry entirely.
		if (existing?.overage_limit != null || existing?.enabled) {
			spendLimits[existingIndex] = {
				...existing,
				usage_limit: undefined,
				usage_limit_interval: undefined,
			};
		} else {
			spendLimits.splice(existingIndex, 1);
		}

		setIsSaving(true);
		try {
			await saveBillingControls(spendLimits);
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
