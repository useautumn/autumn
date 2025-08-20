import { FullCusProduct } from "@autumn/shared";
import Stripe from "stripe";

export const isMultiProductSub = ({
  sub,
  cusProducts,
}: {
  sub: Stripe.Subscription;
  cusProducts: FullCusProduct[];
}) => {
  const cusProductsOnSub = cusProducts.filter((cp) =>
    cp.subscription_ids?.some((id) => id === sub.id)
  );

  return cusProductsOnSub.length > 1;
};
