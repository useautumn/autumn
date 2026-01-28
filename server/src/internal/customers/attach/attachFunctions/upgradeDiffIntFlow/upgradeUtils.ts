import type Stripe from "stripe";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

export const getNextCycle = (stripeSubs: Stripe.Subscription[]) => {
	const { end } = subToPeriodStartEnd({ sub: stripeSubs[0] });
	const nextCycle = end * 1000;
	return nextCycle;
};
