import type { InvoiceLineItem } from "@autumn/shared";
import { useCallback, useMemo, useState } from "react";

export type ReissueCustomField = { _id: string; name: string; value: string };
export type ReissueAddedLine = {
	_id: string;
	description: string;
	amount: string;
};

export type ReissueAddress = {
	line1: string;
	line2: string;
	city: string;
	state: string;
	postal_code: string;
	country: string;
};

export type ReissueFormState = {
	email: string;
	netTermsDays: string;
	templateId: string | null;
	taxMode: "keep" | "automatic" | "none";
	amounts: Record<string, string>;
	removedLineIds: string[];
	addedLines: ReissueAddedLine[];
	customFields: ReissueCustomField[];
	memo: string;
	footer: string;
	customerName: string;
	address: ReissueAddress;
	taxIdOptionId: string | null;
	taxIdValue: string;
};

export type ReissueTaxId = { type: string; value: string };

export type ReissuePrefill = {
	customerName?: string | null;
	address?: Partial<ReissueAddress> | null;
	taxIdOptionId?: string | null;
	taxIdValue?: string | null;
	/** Registrations beyond the one the form edits; sent back untouched. */
	otherTaxIds?: ReissueTaxId[];
	/** Stripe returned one page of registrations, so a replacement would drop the rest. */
	taxIdsIncomplete?: boolean;
};

const EMPTY_ADDRESS: ReissueAddress = {
	line1: "",
	line2: "",
	city: "",
	state: "",
	postal_code: "",
	country: "",
};

let rowCounter = 0;
const rowId = (prefix: string) => `${prefix}_${Date.now()}_${rowCounter++}`;

const trimmed = (value: string) => value.trim();

/** Only fields the user actually changed are sent, so an untouched sheet is a plain reissue. */
export const buildReissuePayload = ({
	invoiceId,
	form,
	prefill,
	lineItems,
	preview = false,
}: {
	invoiceId: string;
	form: ReissueFormState;
	prefill: ReissuePrefill;
	lineItems: InvoiceLineItem[];
	preview?: boolean;
}) => {
	const knownLineIds = new Set(lineItems.map((line) => line.id));
	const updates = Object.entries(form.amounts).flatMap(([id, value]) =>
		knownLineIds.has(id) &&
		!form.removedLineIds.includes(id) &&
		trimmed(value) !== ""
			? [{ id, amount: Number(value) }]
			: [],
	);
	const adds = form.addedLines.flatMap((line) =>
		trimmed(line.description) && trimmed(line.amount) !== ""
			? [
					{
						description: trimmed(line.description),
						amount: Number(line.amount),
					},
				]
			: [],
	);
	const lines = {
		...(updates.length ? { update: updates } : {}),
		...(form.removedLineIds.length ? { remove: form.removedLineIds } : {}),
		...(adds.length ? { add: adds } : {}),
	};

	const customFields = form.customFields
		.filter((field) => trimmed(field.name) && trimmed(field.value))
		.map((field) => ({
			name: trimmed(field.name),
			value: trimmed(field.value),
		}));
	const invoice = {
		...(form.taxMode === "automatic" ? { automatic_tax: true } : {}),
		...(form.taxMode === "none" ? { tax_rate_id: null } : {}),
		...(customFields.length ? { custom_fields: customFields } : {}),
		...(trimmed(form.memo) ? { memo: trimmed(form.memo) } : {}),
		...(trimmed(form.footer) ? { footer: trimmed(form.footer) } : {}),
	};

	const addressChanged = (
		Object.keys(form.address) as (keyof ReissueAddress)[]
	).some(
		(key) =>
			trimmed(form.address[key]) !== trimmed(prefill.address?.[key] ?? ""),
	);
	const nameChanged =
		trimmed(form.customerName) !== trimmed(prefill.customerName ?? "");
	const taxIdChanged =
		form.taxIdOptionId !== (prefill.taxIdOptionId ?? null) ||
		trimmed(form.taxIdValue) !== trimmed(prefill.taxIdValue ?? "");
	const editedTaxId: ReissueTaxId | null =
		form.taxIdOptionId && trimmed(form.taxIdValue)
			? {
					type: form.taxIdOptionId.split(":")[1],
					value: trimmed(form.taxIdValue),
				}
			: null;
	const hadTaxId = Boolean(prefill.taxIdOptionId && prefill.taxIdValue);
	const customer = {
		...(nameChanged && trimmed(form.customerName)
			? { name: trimmed(form.customerName) }
			: {}),
		// Blank fields are sent as "" so Stripe clears them instead of keeping the old value.
		...(addressChanged
			? {
					address: Object.fromEntries(
						Object.entries(form.address).map(([key, value]) => [
							key,
							trimmed(value),
						]),
					),
				}
			: {}),
		// tax_ids replaces the whole set, so the untouched ones ride along.
		...(taxIdChanged && (editedTaxId || hadTaxId)
			? {
					tax_ids: [
						...(editedTaxId ? [editedTaxId] : []),
						...(prefill.otherTaxIds ?? []),
					],
				}
			: {}),
	};

	return {
		invoice_id: invoiceId,
		...(preview ? { preview: true } : {}),
		...(form.templateId ? { invoice_template_id: form.templateId } : {}),
		...(trimmed(form.email)
			? { update_customer_email: trimmed(form.email) }
			: {}),
		...(form.netTermsDays ? { net_terms_days: Number(form.netTermsDays) } : {}),
		...(Object.keys(invoice).length ? { invoice } : {}),
		...(Object.keys(customer).length ? { customer } : {}),
		...(Object.keys(lines).length ? { lines } : {}),
	};
};

export const useReissueForm = ({ prefill }: { prefill: ReissuePrefill }) => {
	const [form, setForm] = useState<ReissueFormState>(() => ({
		email: "",
		netTermsDays: "",
		templateId: null,
		taxMode: "keep",
		amounts: {},
		removedLineIds: [],
		addedLines: [],
		customFields: [],
		memo: "",
		footer: "",
		customerName: prefill.customerName ?? "",
		address: { ...EMPTY_ADDRESS, ...(prefill.address ?? {}) },
		taxIdOptionId: prefill.taxIdOptionId ?? null,
		taxIdValue: prefill.taxIdValue ?? "",
	}));

	const patch = useCallback(
		(next: Partial<ReissueFormState>) =>
			setForm((current) => ({ ...current, ...next })),
		[],
	);

	const actions = useMemo(
		() => ({
			patch,
			setAmount: (id: string, value: string) =>
				setForm((current) => ({
					...current,
					amounts: { ...current.amounts, [id]: value },
				})),
			toggleRemoved: (id: string) =>
				setForm((current) => ({
					...current,
					removedLineIds: current.removedLineIds.includes(id)
						? current.removedLineIds.filter((removed) => removed !== id)
						: [...current.removedLineIds, id],
				})),
			addLine: () =>
				setForm((current) => ({
					...current,
					addedLines: [
						...current.addedLines,
						{ _id: rowId("line"), description: "", amount: "" },
					],
				})),
			updateAddedLine: (id: string, next: Partial<ReissueAddedLine>) =>
				setForm((current) => ({
					...current,
					addedLines: current.addedLines.map((line) =>
						line._id === id ? { ...line, ...next } : line,
					),
				})),
			removeAddedLine: (id: string) =>
				setForm((current) => ({
					...current,
					addedLines: current.addedLines.filter((line) => line._id !== id),
				})),
			addCustomField: () =>
				setForm((current) => ({
					...current,
					customFields: [
						...current.customFields,
						{ _id: rowId("field"), name: "", value: "" },
					],
				})),
			updateCustomField: (id: string, next: Partial<ReissueCustomField>) =>
				setForm((current) => ({
					...current,
					customFields: current.customFields.map((field) =>
						field._id === id ? { ...field, ...next } : field,
					),
				})),
			removeCustomField: (id: string) =>
				setForm((current) => ({
					...current,
					customFields: current.customFields.filter(
						(field) => field._id !== id,
					),
				})),
			setAddress: (next: Partial<ReissueAddress>) =>
				setForm((current) => ({
					...current,
					address: { ...current.address, ...next },
				})),
		}),
		[patch],
	);

	return { form, ...actions };
};
