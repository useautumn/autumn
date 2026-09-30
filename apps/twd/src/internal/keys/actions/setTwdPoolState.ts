import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import {
	LEGACY_POOL_STATE_TAG,
	LEGACY_POOL_TAG,
	stripeForKey,
	TWD_POOL_TAG,
	TWD_STATE_TAG,
} from "../stripeForKey.ts";

export type TwdPoolState = "clean" | "nuking";

/** Existing metadata + twd tags; Stripe unsets keys set to "", which strips legacy tags. */
export const twdPoolMetadata = ({
	existing,
	state,
	extra,
}: {
	existing: Record<string, string>;
	state: TwdPoolState;
	extra?: Record<string, string>;
}): Record<string, string> => {
	const metadata: Record<string, string> = {
		...existing,
		...extra,
		[TWD_POOL_TAG]: "1",
		[TWD_STATE_TAG]: state,
	};
	for (const legacy of [LEGACY_POOL_TAG, LEGACY_POOL_STATE_TAG]) {
		if (legacy in existing) metadata[legacy] = "";
	}
	return metadata;
};

/** Tags a connected account as twd's (platform key, no Stripe-Account header). Pass `existing` to skip the retrieve. */
export const setTwdPoolState = async ({
	secret,
	accountId,
	state,
	existing,
	extra,
}: {
	secret: string;
	accountId: string;
	state: TwdPoolState;
	existing?: Record<string, string>;
	extra?: Record<string, string>;
}): Promise<void> => {
	const stripe = stripeForKey({ secret });
	const current =
		existing ??
		(
			await withStripeRequestSlot(() =>
				stripe.accounts.retrieve(accountId, undefined, STRIPE_REQUEST_OPTIONS),
			)
		).metadata ??
		{};
	await withStripeRequestSlot(() =>
		stripe.accounts.update(
			accountId,
			{ metadata: twdPoolMetadata({ existing: current, state, extra }) },
			STRIPE_REQUEST_OPTIONS,
		),
	);
};
