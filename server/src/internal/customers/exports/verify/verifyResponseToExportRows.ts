import type {
	BillingVerifyExportRow,
	SubscriptionMismatch,
	VerifyResponse,
} from "@autumn/shared";

export type BillingVerifyExportCustomer = Pick<
	BillingVerifyExportRow,
	"customer_id" | "name" | "email" | "stripe_customer_id"
>;

const LIST_SEPARATOR = ", ";

export const isVerifyResponseClean = ({
	response,
}: {
	response: VerifyResponse;
}) =>
	response.customer_mismatches.length === 0 &&
	response.subscriptions.every(
		(subscription) => subscription.mismatches.length === 0,
	);

const uniqueList = (values: (string | null | undefined)[]) =>
	[...new Set(values.filter((value): value is string => Boolean(value)))].join(
		LIST_SEPARATOR,
	) || null;

/** One row holding every mismatch; a verified customer yields none. */
export const verifyResponseToExportRow = ({
	customer,
	response,
}: {
	customer: BillingVerifyExportCustomer;
	response: VerifyResponse;
}): BillingVerifyExportRow | null => {
	if (isVerifyResponseClean({ response })) return null;

	const mismatched = response.subscriptions.filter(
		(subscription) => subscription.mismatches.length > 0,
	);
	const mismatches: SubscriptionMismatch[] = [
		...response.customer_mismatches,
		...mismatched.flatMap((subscription) => subscription.mismatches),
	];

	return {
		...customer,
		stripe_subscription_ids: uniqueList(
			mismatched.map((subscription) => subscription.stripe_subscription_id),
		),
		severity: mismatches.some((mismatch) => mismatch.severity !== "warning")
			? "error"
			: "warning",
		issues: uniqueList(mismatches.map((mismatch) => mismatch.type)),
		details: uniqueList(
			mismatches.map((mismatch) =>
				mismatch.message ? `${mismatch.type}: ${mismatch.message}` : null,
			),
		),
	};
};
