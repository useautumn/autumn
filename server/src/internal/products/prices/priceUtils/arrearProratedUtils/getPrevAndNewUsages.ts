import { Entitlement, Price, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { priceToInvoiceAmount } from "../getAmountForPrice.js";

export const getUsageFromBalance = ({
  ent,
  price,
  balance,
}: {
  ent: Entitlement;
  price: Price;
  balance: number;
}) => {
  let config = price.config as UsagePriceConfig;
  let billingUnits = config.billing_units || 1;

  let overage = -Math.min(0, balance);
  let roundedOverage = new Decimal(overage)
    .div(billingUnits)
    .ceil()
    .mul(billingUnits)
    .toNumber();

  let usage = new Decimal(ent.allowance!).sub(balance).toNumber();

  let roundedUsage = usage;
  if (overage > 0) {
    roundedUsage = new Decimal(usage)
      .div(billingUnits)
      .ceil()
      .mul(billingUnits)
      .toNumber();
  }

  return { usage, roundedUsage, overage, roundedOverage };
};

export const getPrevAndNewPriceForUpgrade = ({
  ent,
  numReplaceables,
  price,
  newBalance,
  prevBalance,
}: {
  ent: Entitlement;
  numReplaceables: number;
  price: Price;
  newBalance: number;
  prevBalance: number;
}) => {
  const {
    usage: newUsage,
    roundedUsage: newRoundedUsage,
    roundedOverage: newRoundedOverage,
  } = getUsageFromBalance({
    ent,
    price,
    balance: newBalance,
  });

  const {
    usage: prevUsage,
    overage: prevOverage,
    roundedOverage: prevRoundedOverage,
  } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance,
  });

  const { roundedOverage: overageWithReplaceables } = getUsageFromBalance({
    ent,
    price,
    balance: prevBalance - numReplaceables,
  });

  // Get price for usage...
  let prevPrice = priceToInvoiceAmount({
    price,
    overage: overageWithReplaceables,
  });

  let newPrice = priceToInvoiceAmount({
    price,
    overage: newRoundedOverage,
  });

  return {
    prevPrice,
    newPrice,

    prevUsage,
    newUsage,

    overageWithReplaceables,
    newRoundedOverage,
    // newRoundedUsage,
    // prevRoundedOverage,
    // prevOverage,
  };
};
