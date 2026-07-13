import type { VerifyResponse } from "@autumn/shared";

/** Plain-text report: one block per mismatched subscription — the sub id as a
 * header line with one bullet per mismatch message. Empty when all correct. */
export const verifyResponseToText = (response: VerifyResponse): string =>
	response.subscriptions
		.filter((subscription) => subscription.status === "mismatched")
		.map((subscription) =>
			[
				subscription.stripe_subscription_id,
				...subscription.mismatches.map(
					(mismatch) => `- ${mismatch.message ?? mismatch.type}`,
				),
			].join("\n"),
		)
		.join("\n\n");
