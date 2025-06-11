import { Entitlement, Price, UsagePriceConfig } from "@autumn/shared";
import { Decimal } from "decimal.js";

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
