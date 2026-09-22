import type {
	BillingVerifyExportRow,
	SubscriptionMismatch,
	VerifyResponse,
} from "@autumn/shared";

export type BillingVerifyExportCustomer = Pick<
	BillingVerifyExportRow,
	"customer_id" | "name" | "email" | "stripe_customer_id"
>;

export const isVerifyResponseClean = ({
	response,
}: {
	response: VerifyResponse;
}) =>
	response.customer_mismatches.length === 0 &&
	response.subscriptions.every(
		(subscription) => subscription.mismatches.length === 0,
	);

/** One row per mismatch; a verified customer yields none. */
export const verifyResponseToExportRows = ({
	customer,
	response,
}: {
	customer: BillingVerifyExportCustomer;
	response: VerifyResponse;
}): BillingVerifyExportRow[] => {
	const toRow = ({
		mismatch,
		stripeSubscriptionId,
	}: {
		mismatch: SubscriptionMismatch;
		stripeSubscriptionId: string | null;
	}): BillingVerifyExportRow => ({
		...customer,
		stripe_subscription_id: stripeSubscriptionId,
		severity: mismatch.severity ?? "error",
		type: mismatch.type,
		message: mismatch.message ?? null,
	});

	return [
		...response.customer_mismatches.map((mismatch) =>
			toRow({ mismatch, stripeSubscriptionId: null }),
		),
		...response.subscriptions.flatMap((subscription) =>
			subscription.mismatches.map((mismatch) =>
				toRow({
					mismatch,
					stripeSubscriptionId: subscription.stripe_subscription_id,
				}),
			),
		),
	];
};
