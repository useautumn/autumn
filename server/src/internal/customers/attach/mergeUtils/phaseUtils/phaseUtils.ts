import { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { formatPrice } from "@/internal/products/prices/priceUtils.js";
import { FullCusProduct } from "@autumn/shared";
import { differenceInDays } from "date-fns";
import Stripe from "stripe";

export const cusProductInPhase = ({
  phaseStart,
  phaseStartMillis,
  cusProduct,
}: {
  phaseStart?: number;
  phaseStartMillis?: number;
  cusProduct: FullCusProduct;
}) => {
  // Require customer product to start at least one full day before the phase start
  return (
    differenceInDays(
      phaseStartMillis ?? phaseStart! * 1000,
      cusProduct.starts_at
    ) >= -1 // give buffer
  );
};

export const similarUnix = ({
  unix1,
  unix2,
}: {
  unix1: number;
  unix2: number;
}) => {
  return Math.abs(differenceInDays(unix1, unix2)) <= 1;
};

// Price quantity pair
export const logPhaseItems = async ({
  items,
  db,
}: {
  items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[];
  db: DrizzleCli;
}) => {
  const priceIds = items.map((item) => item.price as string);
  const autumnPrices = await PriceService.getByStripeIds({
    db,
    stripePriceIds: priceIds,
  });
  for (const item of items) {
    console.log({
      price: item.price,
      quantity: item.quantity,
      autumnPrice: autumnPrices[item.price as string]
        ? `${autumnPrices[item.price as string]?.product.name} - ${formatPrice({ price: autumnPrices[item.price as string] })}`
        : "N/A",
    });
  }
};
