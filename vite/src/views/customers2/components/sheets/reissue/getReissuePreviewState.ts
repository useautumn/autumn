import type { ReissueFormState, ReissuePrefill } from "./useReissueForm";

const getFormError = ({
	form,
	prefill,
}: {
	form: ReissueFormState;
	prefill: ReissuePrefill;
}): string | null => {
	if (
		form.netTermsDays !== "" &&
		(!Number.isInteger(Number(form.netTermsDays)) ||
			Number(form.netTermsDays) < 1)
	) {
		return "Payment terms must be a whole number of days greater than zero.";
	}
	if (
		Object.values(form.amounts).some(
			(amount) => amount.trim() !== "" && !Number.isFinite(Number(amount)),
		) ||
		form.addedLines.some(
			(line) =>
				(line.description.trim() !== "" || line.amount.trim() !== "") &&
				(!line.description.trim() ||
					!line.amount.trim() ||
					!Number.isFinite(Number(line.amount))),
		)
	) {
		return "Complete each added line and enter a valid amount.";
	}
	if (
		Object.entries(form.address).some(
			([key, value]) =>
				value.trim() !==
				(
					prefill.address?.[key as keyof ReissueFormState["address"]] ?? ""
				).trim(),
		) &&
		!form.address.country.trim()
	) {
		return "Choose a country to preview the updated address.";
	}
	if (
		prefill.address?.postal_code?.trim() &&
		!form.address.postal_code.trim()
	) {
		return "Enter a postal code to preview the updated address.";
	}
	if (
		!prefill.taxIdsIncomplete &&
		(form.taxIdOptionId !== (prefill.taxIdOptionId ?? null) ||
			form.taxIdValue.trim() !== (prefill.taxIdValue ?? "").trim()) &&
		Boolean(form.taxIdOptionId) !== Boolean(form.taxIdValue.trim())
	) {
		return "Choose a tax ID type and enter its number to preview tax.";
	}
	return null;
};

export const getReissuePreviewState = ({
	form,
	prefill,
	currentPayload,
	debouncedPayload,
	successfulPayload,
	isFetching,
	error,
}: {
	form: ReissueFormState;
	prefill: ReissuePrefill;
	currentPayload: string;
	debouncedPayload: string;
	successfulPayload?: string;
	isFetching: boolean;
	error: string | null;
}) => {
	const formError = getFormError({ form, prefill });
	const debouncing = currentPayload !== debouncedPayload;
	const currentError = formError ?? (debouncing ? null : error);
	const ready =
		!currentError &&
		!debouncing &&
		!isFetching &&
		successfulPayload === currentPayload;

	return {
		ready,
		error: currentError,
		recalculating: !currentError && !ready,
	};
};
