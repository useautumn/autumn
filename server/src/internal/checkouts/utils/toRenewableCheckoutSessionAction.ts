import { msToSeconds, type StripeCheckoutSessionAction } from "@autumn/shared";

const isElapsed = ({
	timestamp,
	nowSeconds,
}: {
	timestamp?: number;
	nowSeconds: number;
}) => timestamp !== undefined && timestamp <= nowSeconds;

/** Keeps the quoted items but drops absolute times that have passed since the link was created. */
export const toRenewableCheckoutSessionAction = ({
	checkoutSessionAction,
}: {
	checkoutSessionAction: StripeCheckoutSessionAction;
}): StripeCheckoutSessionAction => {
	const nowSeconds = msToSeconds(Date.now());
	const { params, checkoutSessionParams } = checkoutSessionAction;
	const subscriptionData = params.subscription_data;

	const trialElapsed = isElapsed({
		timestamp: subscriptionData?.trial_end,
		nowSeconds,
	});
	const anchorElapsed = isElapsed({
		timestamp: subscriptionData?.billing_cycle_anchor,
		nowSeconds,
	});

	return {
		...checkoutSessionAction,
		params: {
			...params,
			expires_at: undefined,
			subscription_data: subscriptionData && {
				...subscriptionData,
				...(trialElapsed && {
					trial_end: undefined,
					trial_settings: undefined,
				}),
				...(anchorElapsed && {
					billing_cycle_anchor: undefined,
					proration_behavior: undefined,
				}),
			},
		},
		checkoutSessionParams: checkoutSessionParams && {
			...checkoutSessionParams,
			expires_at: undefined,
		},
	};
};
