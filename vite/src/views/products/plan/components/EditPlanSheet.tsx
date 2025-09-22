import { BillingInterval } from "@autumn/shared";
import { useId, useState } from "react";
import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import { Input } from "@/components/v2/inputs/input";
import { LongInput } from "@/components/v2/inputs/LongInput";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/select";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export function EditPlanSheet() {
	const nameId = useId();

	const [defaultPlan, setDefaultPlan] = useState(false);

	return (
		<div className="min-w-md bg-card z-50 border-l shadow-sm flex flex-col">
			<SheetHeader
				title="New Plan"
				description="Configure how this feature is used in your app"
			/>
			<SheetSection title="Plan Details">
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<div className="text-form-label block mb-1">Name</div>
							<Input id={nameId} placeholder="eg. Pro Plan" />
						</div>
						<div>
							<div className="text-form-label block mb-1">ID</div>
							<Input placeholder="fills automatically" disabled />
						</div>
					</div>
					<div>
						<div className="text-form-label block mb-1">Description</div>
						<LongInput placeholder="eg. Pro Plan" />
					</div>
				</div>
			</SheetSection>
			<SheetSection title="Plan Pricing">
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<div className="text-form-label block mb-1">Price</div>
							<Input type="number" placeholder="eg. $100" />
						</div>
						<div>
							<div className="text-form-label block mb-1">Interval</div>
							<Select
							// value={interval}
							// onValueChange={(value) => setInterval(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select interval" />
								</SelectTrigger>
								<SelectContent>
									{Object.values(BillingInterval).map((interval) => (
										<SelectItem key={interval} value={interval}>
											{keyToTitle(interval)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
			</SheetSection>

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
								base products (eg, for top ups)"
						disabled={true}
					/>
				</div>
			</SheetSection>
		</div>
	);
}
