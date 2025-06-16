import Stripe from "stripe";
import {
  stripeToAutumnInterval,
  subItemToAutumnInterval,
} from "tests/utils/stripeUtils.js";

export const logSubItems = (sub: Stripe.Subscription) => {
  for (const item of sub.items.data) {
    let isMetered = item.price.recurring?.usage_type === "metered";
    let isTiered = item.price.billing_scheme === "tiered";

    if (isMetered) {
      console.log(`Usage price`);
    } else {
      let price = item.price.unit_amount! / 100;
      let interval = subItemToAutumnInterval(item);
      console.log(`${price} / ${interval}`);
    }
  }
};
