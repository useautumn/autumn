import { findStripeTaxIdOption } from "@autumn/shared";
import {
	Button,
	Input,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useState } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { CountrySelect } from "./CountrySelect";
import { TaxIdTypeSelect } from "./TaxIdTypeSelect";
import type {
	ReissueAddress,
	ReissueFormState,
	ReissuePrefill,
} from "./useReissueForm";

const TAX_OPTIONS = [
	{ label: "Keep current tax settings", value: "keep" },
	{ label: "Calculate tax automatically", value: "automatic" },
	{ label: "No tax", value: "none" },
];

export function ReissueBillingDetails({
	form,
	prefill,
	patch,
	setAddress,
}: {
	form: ReissueFormState;
	prefill: ReissuePrefill;
	patch: (next: Partial<ReissueFormState>) => void;
	setAddress: (next: Partial<ReissueAddress>) => void;
}) {
	const [editingAddress, setEditingAddress] = useState(false);
	const [editingTaxType, setEditingTaxType] = useState(false);
	const [countryCode, type] = form.taxIdOptionId?.split(":") ?? [];
	const taxIdOption = type
		? findStripeTaxIdOption({ type, countryCode })
		: undefined;
	const addressSummary = [
		form.address.line1,
		form.address.line2,
		[form.address.city, form.address.state, form.address.postal_code]
			.filter(Boolean)
			.join(", "),
	].filter(Boolean);
	const showTaxType =
		editingTaxType || (!form.taxIdOptionId && !!form.taxIdValue);
	const countryChanged =
		form.address.country !== (prefill.address?.country ?? "");

	return (
		<SheetSection title="Billing & tax" className="space-y-4">
			<div className="space-y-1.5">
				<label htmlFor="reissue-tax-calculation" className="text-form-label">
					Tax calculation
				</label>
				<Select
					value={form.taxMode}
					items={TAX_OPTIONS}
					onValueChange={(value) => {
						if (value === "keep" || value === "automatic" || value === "none") {
							patch({ taxMode: value });
						}
					}}
				>
					<SelectTrigger id="reissue-tax-calculation" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{TAX_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<p className="text-xs text-tertiary-foreground">
					{form.taxMode === "automatic"
						? "Calculates tax from the customer's location and tax status. Replaces any existing manual tax rates."
						: form.taxMode === "none"
							? "No tax will be collected on the replacement invoice."
							: "Keeps the invoice's existing settings. To add tax or replace a manual rate, choose Calculate tax automatically."}
				</p>
			</div>

			<div className="space-y-1.5">
				<span className="text-form-label">Billing country</span>
				<CountrySelect
					value={form.address.country}
					onValueChange={(country) => {
						setAddress({ country });
						setEditingAddress(true);
					}}
				/>
				<div className="flex items-start justify-between gap-2">
					<div className="text-xs text-tertiary-foreground">
						{addressSummary.length ? (
							<p>{addressSummary.join(" · ")}</p>
						) : (
							<p>No billing address</p>
						)}
					</div>
					<Button
						variant="skeleton"
						size="sm"
						aria-expanded={editingAddress}
						onClick={() => setEditingAddress(!editingAddress)}
					>
						{editingAddress ? "Hide address" : "Edit address"}
					</Button>
				</div>
				{editingAddress && (
					<div className="space-y-2 pt-2">
						{countryChanged && (
							<p className="text-xs text-secondary-foreground">
								Check the full address matches the new billing country.
							</p>
						)}
						<Input
							aria-label="Address line 1"
							placeholder="Address line 1"
							value={form.address.line1}
							onChange={(event) => setAddress({ line1: event.target.value })}
						/>
						<Input
							aria-label="Address line 2"
							placeholder="Address line 2"
							value={form.address.line2}
							onChange={(event) => setAddress({ line2: event.target.value })}
						/>
						<div className="grid grid-cols-2 gap-2">
							<Input
								aria-label="City"
								placeholder="City"
								value={form.address.city}
								onChange={(event) => setAddress({ city: event.target.value })}
							/>
							<Input
								aria-label="State"
								placeholder="State"
								value={form.address.state}
								onChange={(event) => setAddress({ state: event.target.value })}
							/>
						</div>
						<Input
							aria-label="Postal code"
							placeholder="Postal code"
							value={form.address.postal_code}
							onChange={(event) =>
								setAddress({ postal_code: event.target.value })
							}
						/>
					</div>
				)}
			</div>

			<div className="space-y-1.5">
				<div className="flex items-center justify-between gap-2">
					<label htmlFor="reissue-tax-id" className="text-form-label">
						VAT / tax ID{" "}
						<span className="text-tertiary-foreground">(optional)</span>
					</label>
					{!prefill.taxIdsIncomplete && (
						<Button
							variant="skeleton"
							size="sm"
							aria-expanded={showTaxType}
							onClick={() => setEditingTaxType(!editingTaxType)}
						>
							{form.taxIdOptionId ? "Change type" : "Choose type"}
						</Button>
					)}
				</div>
				{showTaxType && !prefill.taxIdsIncomplete && (
					<div className="space-y-1.5">
						<p className="text-xs text-tertiary-foreground">
							Customer's registration type — not a tax rate
						</p>
						<TaxIdTypeSelect
							value={form.taxIdOptionId}
							onValueChange={(id) => {
								patch({ taxIdOptionId: id });
								setEditingTaxType(false);
							}}
						/>
					</div>
				)}
				<div className="flex items-center gap-2">
					<Input
						id="reissue-tax-id"
						disabled={prefill.taxIdsIncomplete}
						value={form.taxIdValue}
						placeholder="Enter the customer's VAT or tax ID"
						onChange={(event) => patch({ taxIdValue: event.target.value })}
					/>
					{!prefill.taxIdsIncomplete &&
						(form.taxIdOptionId || form.taxIdValue) && (
							<Button
								variant="skeleton"
								size="sm"
								onClick={() => patch({ taxIdOptionId: null, taxIdValue: "" })}
							>
								Remove
							</Button>
						)}
				</div>
				{taxIdOption && (
					<p className="text-xs text-secondary-foreground">
						{taxIdOption.type === "eu_vat"
							? "EU VAT registration"
							: `${taxIdOption.country} · ${taxIdOption.label}`}
					</p>
				)}
				<p className="text-xs text-tertiary-foreground">
					{prefill.taxIdsIncomplete
						? "Edit registrations in Stripe so none are dropped; only part of the list was returned."
						: "Only enter an ID supplied by the customer. This does not select a tax rate and may mean no VAT is collected."}
				</p>
				{!!prefill.otherTaxIds?.length && (
					<p className="text-xs text-tertiary-foreground">
						Other tax registrations on this customer stay unchanged.
					</p>
				)}
			</div>
			<p className="text-xs text-tertiary-foreground">
				The preview updates as you edit. Customer details are saved only when
				you reissue.
			</p>
		</SheetSection>
	);
}
