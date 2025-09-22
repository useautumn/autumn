import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import Stripe from "stripe";

export const getNextCycle = (stripeSubs: Stripe.Subscription[]) => {
	const { end } = subToPeriodStartEnd({ sub: stripeSubs[0] });
	const nextCycle = end * 1000;
	return nextCycle;
};
