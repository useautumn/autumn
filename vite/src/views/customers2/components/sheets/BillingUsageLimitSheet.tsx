import {
	type DbUsageLimit,
	type Feature,
	FeatureType,
	type FullCustomer,
	ResetInterval,
	USAGE_LIMIT_FILTER_MAX_KEY_LENGTH,
	USAGE_LIMIT_FILTER_MAX_KEYS,
	USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH,
	usageLimitFilterKey,
} from "@autumn/shared";
import {
	Button,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
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
import {
	type UsageLimitCondition,
	UsageLimitConditionRows,
} from "./UsageLimitConditionRows";
import { useCustomerPropertyKeys } from "./useCustomerPropertyKeys";

// Interval is required (no inherit) and one_off intervals are not supported.
const INTERVAL_OPTIONS: Record<string, string> = {
	[ResetInterval.Day]: "Day",
	[ResetInterval.Week]: "Week",
	[ResetInterval.Month]: "Month",
	[ResetInterval.Year]: "Year",
};

/** Build the usage_limits entry for an interval-based hard cap. */
export const buildUsageLimitItem = ({
	featureId,
	limit,
	interval,
	filter,
}: {
	featureId: string;
	limit: number;
	interval: string;
	filter?: DbUsageLimit["filter"];
}): DbUsageLimit => ({
	feature_id: featureId,
	limit,
	interval: interval as ResetInterval,
	...(filter && { filter }),
});

const conditionsFromFilter = (
	filter: DbUsageLimit["filter"],
): UsageLimitCondition[] =>
	Object.entries(filter?.properties ?? {}).map(([key, value]) => ({
		key,
		value: String(value),
	}));

/** Trimmed, non-empty rows -> filter.properties; error on partial rows. */
const conditionsToFilter = (
	conditions: UsageLimitCondition[],
): { filter?: DbUsageLimit["filter"]; error?: string } => {
	const filled = conditions
		.map(({ key, value }) => ({ key: key.trim(), value: value.trim() }))
		.filter(({ key, value }) => key || value);
	if (filled.length === 0) return {};

	if (filled.some(({ key, value }) => !key || !value)) {
		return { error: "Each condition needs both a property and a value" };
	}
	if (filled.length > USAGE_LIMIT_FILTER_MAX_KEYS) {
		return {
			error: `At most ${USAGE_LIMIT_FILTER_MAX_KEYS} conditions are allowed`,
		};
	}
	if (
		filled.some(({ key }) => key.length > USAGE_LIMIT_FILTER_MAX_KEY_LENGTH)
	) {
		return {
			error: `Property names must be at most ${USAGE_LIMIT_FILTER_MAX_KEY_LENGTH} characters`,
		};
	}
	if (
		filled.some(
			({ value }) => value.length > USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH,
		)
	) {
		return {
			error: `Values must be at most ${USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH} characters`,
		};
	}
	const keys = filled.map(({ key }) => key);
	const duplicateKey = keys.find((key, index) => keys.indexOf(key) !== index);
	if (duplicateKey) {
		return {
			error: `"${duplicateKey}" can only be used once. To cap several values, create a separate limit for each.`,
		};
	}

	return {
		filter: {
			properties: Object.fromEntries(
				filled.map(({ key, value }) => [key, value]),
			),
		},
	};
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
	const [usageLimit, setUsageLimit] = useState(
		existingItem?.limit?.toString() ?? "",
	);
	const [selectedInterval, setSelectedInterval] = useState<string>(
		existingItem?.interval ?? ResetInterval.Month,
	);
	const [conditions, setConditions] = useState<UsageLimitCondition[]>(
		conditionsFromFilter(existingItem?.filter),
	);
	const propertySuggestions = useCustomerPropertyKeys({
		customerId: fullCustomer?.id || fullCustomer?.internal_id,
	});

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

		const { filter, error: filterError } = conditionsToFilter(conditions);
		if (filterError) {
			toast.error(filterError);
			return;
		}

		const item = buildUsageLimitItem({
			featureId,
			limit: parsedLimit,
			interval: selectedInterval,
			filter,
		});

		const usageLimits = getCurrentUsageLimits();
		const itemIdentity = `${item.feature_id}|${usageLimitFilterKey(item.filter)}`;
		const duplicate = usageLimits.some(
			(existing, index) =>
				!(isEdit && index === existingIndex) &&
				`${existing.feature_id}|${usageLimitFilterKey(existing.filter)}` ===
					itemIdentity,
		);
		if (duplicate) {
			toast.error(
				item.filter
					? "A usage limit with these conditions already exists for this feature"
					: "This feature already has a usage limit without conditions",
			);
			return;
		}

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
					description="Hard-cap how much of a feature can be used per interval, regardless of remaining balance."
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
								placeholder="Max usage allowed per interval"
								type="number"
								value={usageLimit}
								onChange={(e) => setUsageLimit(e.target.value)}
							/>
						</div>

						<div>
							<FormLabel>Interval</FormLabel>
							<Select
								value={selectedInterval}
								onValueChange={setSelectedInterval}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select interval" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(INTERVAL_OPTIONS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div>
							<FormLabel>Conditions</FormLabel>
							<UsageLimitConditionRows
								conditions={conditions}
								onChange={setConditions}
								suggestions={propertySuggestions}
							/>
							<p className="mt-2 text-tertiary-foreground text-xs">
								Only usage matching every condition counts toward this limit.
							</p>
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
