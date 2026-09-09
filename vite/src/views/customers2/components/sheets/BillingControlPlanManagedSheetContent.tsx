import type {
	ApiUsageLimit,
	BillingControlKey,
	CustomerBillingControls,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { PlanUsageField } from "./PlanUsageField";
import { usePlanUsageDraft } from "./usePlanUsageDraft";

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

export function BillingControlPlanManagedSheetContent() {
	const sheetData = useSheetStore((s) => s.data);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { features } = useFeaturesQuery();

	const controlKey = sheetData?.key as BillingControlKey | undefined;
	const item = sheetData?.item as BillingControlItem | undefined;
	const planName = (sheetData?.planName as string | undefined) ?? "a plan";
	const customerProductId = sheetData?.customerProductId as string | undefined;
	const usageLimit =
		controlKey === "usage_limits" ? (item as ApiUsageLimit) : undefined;

	const usageDraft = usePlanUsageDraft({ usageLimit });

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

	const handleAddOverride = () => {
		setSheet({
			type: BILLING_CONTROL_ADD_SHEETS[controlKey],
			data: { item },
		});
	};

	const handleViewPlan = () => {
		if (!customerProductId) {
			closeSheet();
			return;
		}
		setSheet({ type: "subscription-detail", itemId: customerProductId });
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={BILLING_CONTROL_LABELS[controlKey]}
					description={`Inherited from ${planName}`}
				/>

				<div className="px-4 pt-4">
					<InfoBox
						variant="warning"
						classNames={{ infoBox: "w-full" }}
						action={
							<Button variant="secondary" size="sm" onClick={handleAddOverride}>
								Add override
							</Button>
						}
					>
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

				{usageLimit && (
					<SheetSection withSeparator={false}>
						<PlanUsageField
							usageLimit={usageLimit}
							draftUsage={usageDraft.draftUsage}
							onDraftChange={usageDraft.setDraftUsage}
							isInvalid={usageDraft.isInvalid}
							onSubmit={usageDraft.save}
						/>
					</SheetSection>
				)}

				<SheetFooter>
					<Button
						variant="secondary"
						className={cn("w-full", !usageLimit && "col-span-2")}
						onClick={handleViewPlan}
					>
						{customerProductId ? "View Plan" : "Cancel"}
					</Button>
					{usageLimit && (
						<Button
							variant="primary"
							className="w-full"
							disabled={!usageDraft.canSave}
							isLoading={usageDraft.isSaving}
							onClick={usageDraft.save}
						>
							Save
						</Button>
					)}
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
