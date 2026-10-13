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
 * The period lines without their own inherit: only one the request gives, which
 * must contain every line period. Without it, such lines carry no period, as before.
 */
export const resolveInvoiceEnvelope = ({
	params,
}: {
	params: CreateInvoiceParams;
}): InvoicePeriod | undefined => {
	const given = toInvoicePeriod(params);
	if (!given) return undefined;

	const outside = ownLinePeriods({ params }).find(
		(period) => period.start < given.start || period.end > given.end,
	);
	if (outside) {
		throw new RecaseError({
			message: `A line period (${outside.start} to ${outside.end}, unix ms) falls outside the invoice's period_start / period_end.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return given;
};
