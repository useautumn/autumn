import { useState } from "react";
import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { BasePriceSection } from "./edit-plan-details/BasePriceSection";
import { FreeTrialSection } from "./edit-plan-details/FreeTrialSection";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";

export function EditPlanSheet() {
	const [defaultPlan, setDefaultPlan] = useState(false);

	return (
		<>
			<SheetHeader
				title="New Plan"
				description="Configure how this feature is used in your app"
			/>
			<MainDetailsSection />
			<BasePriceSection />

			<SheetSection title="Additional Options">
				<div className="space-y-4">
					<LongCheckbox
						title="Default"
						subtitle="This product will be enabled by default for all new users,
								typically used for your free plan"
						checked={defaultPlan}
						onCheckedChange={setDefaultPlan}
					/>
					<LongCheckbox
						title="Add On"
						subtitle="This product is an add-on that can be bought together with your
								base products (eg, top ups)"
						disabled={true}
					/>
				</div>
			</SheetSection>
			<FreeTrialSection />
		</>
	);
}
