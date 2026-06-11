import type Stripe from "stripe";

// stripe-node exports Decimal as a value only (not in the Stripe type
// namespace), so ReturnType is the only way to name the branded type.
export type StripeDecimal = ReturnType<typeof Stripe.Decimal.from>;
