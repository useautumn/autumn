import { BillingInterval, FreeTrialDuration } from "@autumn/shared";
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
import { FreeTrialConfig } from "../../product/free-trial/FreeTrialConfig";

export function EditPlanSheet() {
	const [defaultPlan, setDefaultPlan] = useState(false);
	const [fixedPrice, setFixedPrice] = useState(true);
	const [freeTrial, setFreeTrial] = useState({
		length: 7,
		unique_fingerprint: false,
		duration: FreeTrialDuration.Day,
		card_required: true,
	});

	const nameId = useId();

	return (
		<div className="min-w-md max-w-md bg-card z-50 border-l shadow-sm flex flex-col">
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
			<SheetSection
				title="Base Price"
				checked={fixedPrice}
				setChecked={setFixedPrice}
				// infoContent="A fixed price to charge for this plan (eg $100 per month)"
			>
				<p className="text-body-secondary mb-4">
					Fixed recurring price (e.g., $100/month). Leave unchecked for free or
					usage-based only plans.
				</p>

				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div>
							<div className="text-form-label block mb-1">Price</div>
							<Input
								type="number"
								placeholder="eg. $100"
								disabled={!fixedPrice}
							/>
						</div>
						<div>
							<div className="text-form-label block mb-1">Interval</div>
							<Select disabled={!fixedPrice}>
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
			<SheetSection
				title="Free Trial"
				checked={freeTrial}
				setChecked={setFreeTrial}
			>
				<FreeTrialConfig freeTrial={freeTrial} setFreeTrial={setFreeTrial} />
			</SheetSection>
		</div>
	);
}
