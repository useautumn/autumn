import { CheckoutAction } from "../../models/checkouts/checkoutTable";

export const ATTACH_CHECKOUT_PATH = "c";
export const UPDATE_SUBSCRIPTION_CHECKOUT_PATH = "u";
export const LONG_LIVED_CHECKOUT_PATH = "co";

export const CHECKOUT_ACTION_PATHS = {
	[CheckoutAction.UpdateSubscription]: UPDATE_SUBSCRIPTION_CHECKOUT_PATH,
	[CheckoutAction.Attach]: ATTACH_CHECKOUT_PATH,
	[CheckoutAction.CreateSchedule]: ATTACH_CHECKOUT_PATH,
} satisfies Record<CheckoutAction, string>;
