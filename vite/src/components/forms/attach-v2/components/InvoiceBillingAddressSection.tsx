import { TAX_EXEMPT_LABELS } from "@autumn/shared";
import {
	Input,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
} from "@autumn/ui";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { CountrySelect } from "@/views/customers2/components/sheets/reissue/CountrySelect";
import { TaxIdTypeSelect } from "@/views/customers2/components/sheets/reissue/TaxIdTypeSelect";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";
import type { InvoiceBillingDetailsForm } from "../utils/invoiceBillingDetails";

const MAX_ADDRESS_LINES = 2;

const TAX_EXEMPT_DESCRIPTIONS: Record<
	InvoiceBillingDetailsForm["taxExempt"],
	string
> = {
	none: "Taxed normally. Needs a billing address.",
	exempt: "Never charged tax. No address needed.",
	reverse: "Customer self-assesses tax. Needs an address and a tax ID.",
};

const TAX_EXEMPT_OPTIONS = Object.entries(TAX_EXEMPT_LABELS).map(
	([value, label]) => ({
		value: value as InvoiceBillingDetailsForm["taxExempt"],
		label: value === "none" ? "None" : label,
	}),
);

function Field({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
			<span className="text-form-label">{label}</span>
			{children}
		</div>
	);
}

export function InvoiceBillingAddressSection({
	taxIncomplete,
}: {
	taxIncomplete: boolean;
}) {
	const { form, formValues } = useAttachFormContext();
	const details = formValues.billingDetails;
	const isExempt = details.taxExempt === "exempt";

	const patch = (changes: Partial<InvoiceBillingDetailsForm>) =>
		form.setFieldValue("billingDetails", { ...details, ...changes });

	const taxRow = (
		<div className="flex gap-2">
			<Field label="Tax ID" className="flex-1 min-w-0">
				<div className="flex gap-2">
					<TaxIdTypeSelect
						compact
						value={details.taxIdOptionId}
						onValueChange={(taxIdOptionId) => patch({ taxIdOptionId })}
					/>
					<Input
						className="flex-1 min-w-0"
						placeholder="Number"
						value={details.taxIdValue}
						onChange={(e) => patch({ taxIdValue: e.target.value })}
					/>
				</div>
			</Field>
			<Field label="Tax exemption" className="w-32 shrink-0">
				<Select
					value={details.taxExempt}
					items={TAX_EXEMPT_OPTIONS}
					onValueChange={(value) =>
						patch({
							taxExempt: value as InvoiceBillingDetailsForm["taxExempt"],
						})
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent align="end" className="w-62">
						<SelectGroup>
							{TAX_EXEMPT_OPTIONS.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									className="items-start py-1.5"
								>
									<span className="flex flex-col gap-0.5">
										<span>{option.label}</span>
										<span className="text-xs text-tertiary-foreground whitespace-normal">
											{TAX_EXEMPT_DESCRIPTIONS[option.value]}
										</span>
									</span>
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		</div>
	);

	return (
		<SheetSection
			title="Billing Address"
			description="Required to calculate tax. Saved to the customer when you send the invoice."
			withSeparator
		>
			<div className="flex flex-col gap-4">
				{isExempt ? (
					<>
						{taxRow}
						<InfoBox variant="note">
							Exempt customers are never charged tax, so no address is needed.
						</InfoBox>
					</>
				) : (
					<>
						<Field label="Country">
							<CountrySelect
								value={details.country}
								onValueChange={(country) => patch({ country })}
							/>
						</Field>
						<Field label="Address">
							<Textarea
								rows={1}
								placeholder="Street address"
								value={details.address}
								onChange={(e) =>
									patch({
										address: e.target.value
											.split("\n")
											.slice(0, MAX_ADDRESS_LINES)
											.join("\n"),
									})
								}
								className="input-base input-shadow-default min-h-0 resize-none rounded-lg px-2 py-1.5 md:text-[13px]"
							/>
						</Field>
						<div className="flex gap-2">
							<Field label="City" className="flex-1 min-w-0">
								<Input
									placeholder="City"
									value={details.city}
									onChange={(e) => patch({ city: e.target.value })}
								/>
							</Field>
							<Field label="State" className="w-22 shrink-0">
								<Input
									placeholder="State"
									value={details.state}
									onChange={(e) => patch({ state: e.target.value })}
								/>
							</Field>
							<Field label="Postal code" className="w-26 shrink-0">
								<Input
									placeholder="Postal code"
									value={details.postalCode}
									onChange={(e) => patch({ postalCode: e.target.value })}
								/>
							</Field>
						</div>
						{taxRow}
						{taxIncomplete && (
							<InfoBox variant="warning">
								Stripe couldn't calculate tax for this address. Check the postal
								code and state.
							</InfoBox>
						)}
					</>
				)}
			</div>
		</SheetSection>
	);
}
