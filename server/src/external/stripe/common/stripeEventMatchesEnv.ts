import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";

/** Live Connect endpoints also receive connected accounts' test-mode events. */
export const stripeEventMatchesEnv = ({
	event,
	env,
}: {
	event: Stripe.Event;
	env: AppEnv;
}) => Boolean(event.livemode) === (env === AppEnv.Live);
