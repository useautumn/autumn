import type {
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
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

export function BillingControlPlanManagedSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const setSheet = useSheetStore((s) => s.setSheet);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { features } = useFeaturesQuery();

	const controlKey = sheetData?.key as BillingControlKey | undefined;
	const item = sheetData?.item as BillingControlItem | undefined;
	const planName = (sheetData?.planName as string | undefined) ?? "a plan";
	const customerProductId = sheetData?.customerProductId as string | undefined;

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
