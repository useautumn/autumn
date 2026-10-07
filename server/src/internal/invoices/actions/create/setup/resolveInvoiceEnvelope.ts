import { type CreateInvoiceParams, ErrCode, RecaseError } from "@autumn/shared";
import type { InvoicePeriod } from "../compute/prorateInvoiceLineAmount";

type PeriodFields = { period_start?: number; period_end?: number };

export const toInvoicePeriod = ({
	period_start,
	period_end,
}: PeriodFields): InvoicePeriod | undefined =>
	period_start !== undefined && period_end !== undefined
		? { start: period_start, end: period_end }
		: undefined;

const ownLinePeriods = ({ params }: { params: CreateInvoiceParams }) =>
	[
		...(params.plans ?? []).flatMap((plan) => [
			plan,
			...(plan.feature_quantities ?? []),
			...(plan.license_quantities ?? []).flatMap((license) => [
				license,
				...(license.feature_quantities ?? []),
			]),
		]),
		...(params.custom_line_items ?? []),
	].flatMap((line: PeriodFields) => toInvoicePeriod(line) ?? []);

/**
 * The invoice's period: the one given, else the earliest line start to the latest
 * line end, else none. Every line period must sit inside a given envelope.
 */
export const resolveInvoiceEnvelope = ({
	params,
}: {
	params: CreateInvoiceParams;
}): InvoicePeriod | undefined => {
	const linePeriods = ownLinePeriods({ params });
	const given = toInvoicePeriod(params);

	if (given) {
		const outside = linePeriods.find(
			(period) => period.start < given.start || period.end > given.end,
		);
		if (outside) {
			throw new RecaseError({
				message: `A line period (${new Date(outside.start).toISOString()} to ${new Date(outside.end).toISOString()}) falls outside the invoice's period_start / period_end.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return given;
	}

	if (linePeriods.length === 0) return undefined;
	return {
		start: Math.min(...linePeriods.map((period) => period.start)),
		end: Math.max(...linePeriods.map((period) => period.end)),
	};
};
