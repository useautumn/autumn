import Stripe from "stripe";

export const getNextCycle = (stripeSubs: Stripe.Subscription[]) => {
  const nextCycle = stripeSubs[0].current_period_end * 1000;
  return nextCycle;
};
