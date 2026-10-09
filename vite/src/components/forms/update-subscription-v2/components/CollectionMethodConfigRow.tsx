import { CollectionMethod } from "@autumn/shared";
import {
	ConditionalTooltip,
	FormLabel,
	GroupedTabButton,
	Input,
	Switch,
} from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { PaymentMethodTypesSelect } from "@/components/forms/shared/PaymentMethodTypesSelect";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

const COLLECTION_METHOD_OPTIONS = [
	{
		value: CollectionMethod.ChargeAutomatically,
		label: "Charge automatically",
	},
	{ value: CollectionMethod.SendInvoice, label: "Send invoice" },
];

export function CollectionMethodConfigRow() {
	const { collectionMethodSwitch } = useUpdateSubscriptionFormContext();
	const {
		selected,
		locked,
		sendsInvoice,
		switchesMethod,
		missingCard,
		netTermsDays,
		paymentMethodTypes,
		applyToAutoTopups,
		setTarget,
		setNetTermsDays,
		setPaymentMethodTypes,
		setApplyToAutoTopups,
	} = collectionMethodSwitch;

	if (!selected) return null;

	return (
		<>
			<ConfigRow
				title="Collection Method"
				description="How this subscription's renewals are paid from now on"
			>
				<ConditionalTooltip enabled={locked} content="Save other changes first">
					<div>
						<GroupedTabButton
							value={selected}
							className="w-full"
							disabled={locked}
							onValueChange={(value) => setTarget(value as CollectionMethod)}
							options={COLLECTION_METHOD_OPTIONS}
						/>
					</div>
				</ConditionalTooltip>
			</ConfigRow>

			{sendsInvoice && !locked && (
				<div className="grid grid-cols-2 gap-3">
					<div className="min-w-0">
						<FormLabel>Net payment terms (days)</FormLabel>
						<Input
							type="number"
							min={1}
							value={netTermsDays > 0 ? String(netTermsDays) : ""}
							onChange={(event) => {
								const parsed = Number.parseInt(event.target.value, 10);
								setNetTermsDays(Number.isNaN(parsed) ? 0 : parsed);
							}}
						/>
					</div>
					<PaymentMethodTypesSelect
						value={paymentMethodTypes}
						onValueChange={setPaymentMethodTypes}
					/>
				</div>
			)}

			{(sendsInvoice || switchesMethod) && !locked && (
				<ConfigRow
					title="Apply to auto top-ups"
					description={
						sendsInvoice
							? "This customer's auto top-ups are invoiced too"
							: "This customer's auto top-ups are charged automatically too"
					}
					action={
						<Switch
							checked={applyToAutoTopups}
							onCheckedChange={(checked) => setApplyToAutoTopups(!!checked)}
						/>
					}
				/>
			)}

			{missingCard && (
				<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
					<span className="font-medium">No card on file</span>
					{"\n"}Without one, the next renewal would fail. Send the customer a
					link to add a card, then switch.
				</InfoBox>
			)}
		</>
	);
}
