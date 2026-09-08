import type {
	BillingControlKey,
	CustomerBillingControls,
	DbUsageLimit,
} from "@autumn/shared";
import { Button, FormLabel, Input } from "@autumn/ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BillingControlsList } from "@/components/billing-controls/BillingControlsDisplay";
import {
	BILLING_CONTROL_ADD_SHEETS,
	BILLING_CONTROL_LABELS,
} from "@/components/billing-controls/billingControlSheets";
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
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

export function BillingControlPlanManagedSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { features } = useFeaturesQuery();
	const { customer, refetch } = useCusQuery();
	const axios = useAxiosInstance();
	const [usage, setUsage] = useState("");
	const [isSavingUsage, setIsSavingUsage] = useState(false);

	const controlKey = sheetData?.key as BillingControlKey | undefined;
	const item = sheetData?.item as BillingControlItem | undefined;
	const planName = (sheetData?.planName as string | undefined) ?? "a plan";
	const customerProductId = sheetData?.customerProductId as string | undefined;
	const usageLimitItem =
		controlKey === "usage_limits" ? (item as DbUsageLimit) : undefined;

	const featureNameById = useMemo(
		() => new Map((features ?? []).map((f) => [f.id, f.name])),
		[features],
	);

	const previewControls = useMemo((): CustomerBillingControls => {
		if (!(controlKey && item)) return {};
		return {
			[controlKey]: [item],
		} as CustomerBillingControls;
	}, [controlKey, item]);

	if (!(controlKey && item)) return null;

	const label = BILLING_CONTROL_LABELS[controlKey];

	const handleAddOverride = () => {
		setSheet({
			type: BILLING_CONTROL_ADD_SHEETS[controlKey],
			data: { item },
		});
	};

	const handleSaveUsage = async () => {
		if (!usage.trim()) return;
		const value = Number(usage);
		const customerId = customer?.id ?? customer?.internal_id;
		const featureId = usageLimitItem?.feature_id;
		if (!customerId || !featureId || controlKey !== "usage_limits") return;
		if (!Number.isFinite(value) || value < 0) {
			toast.error("Please enter a valid current usage");
			return;
		}
		setIsSavingUsage(true);
		try {
			await CusService.updateCustomer({
				axios,
				customer_id: customerId,
				data: {
					billing_controls: {
						usage_limits: [
							{
								feature_id: featureId,
								usage: value,
								...(usageLimitItem?.filter && {
									filter: usageLimitItem.filter,
								}),
							},
						],
					},
				},
			});
			await refetch();
			setUsage("");
			toast.success("Usage updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update usage",
			);
		} finally {
			setIsSavingUsage(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader title={label} description={`Inherited from ${planName}`} />

				<div className="px-4 pt-4">
					<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
						This billing control is managed by {planName}. Add an override to
						change it for this customer only.
					</InfoBox>
				</div>

				<SheetSection withSeparator={false}>
					<BillingControlsList
						billingControls={previewControls}
						featureNameById={featureNameById}
						slim
					/>
				</SheetSection>

				{controlKey === "usage_limits" && (
					<SheetSection withSeparator={false}>
						<FormLabel>Current usage</FormLabel>
						<div className="flex gap-2">
							<Input
								type="number"
								min="0"
								value={usage}
								onChange={(event) => setUsage(event.target.value)}
								placeholder="Set usage"
							/>
							<Button
								variant="secondary"
								onClick={handleSaveUsage}
								isLoading={isSavingUsage}
							>
								Save
							</Button>
						</div>
					</SheetSection>
				)}

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={() => {
							if (!customerProductId) {
								closeSheet();
								return;
							}
							setSheet({
								type: "subscription-detail",
								itemId: customerProductId,
							});
						}}
					>
						{customerProductId ? "View Plan" : "Cancel"}
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleAddOverride}
					>
						Add Override
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
