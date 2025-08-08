import { subItemToAutumnInterval } from "@/external/stripe/utils.js";
import Stripe from "stripe";

export const logSubItems = ({
  sub,
  subItems,
}: {
  sub?: Stripe.Subscription;
  subItems?: Stripe.SubscriptionItem[];
}) => {
  let finalSubItems = subItems || sub!.items.data;
  for (const item of finalSubItems) {
    let isMetered = item.price.recurring?.usage_type === "metered";
    let isTiered = item.price.billing_scheme === "tiered";

    if (isMetered) {
      console.log(`Usage price`);
    } else {
      let price = item.price.unit_amount! / 100;
      let subInterval = subItemToAutumnInterval(item);
      console.log(
        `${price} ${item.price.currency} / ${subInterval?.interval} (${subInterval?.intervalCount})`
      );
    }
  }
};
