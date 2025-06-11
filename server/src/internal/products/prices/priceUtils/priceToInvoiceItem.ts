import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import {
  FullEntitlement,
  getFeatureInvoiceDescription,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { priceToInvoiceAmount } from "./priceToInvoiceAmount.js";
import { Proration } from "@/internal/invoices/prorationUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";

export const priceToInvoiceItem = ({
  price,
  ent,
  usage,
  prodName,
  org,
  proration,
  now,
  allowNegative,
}: {
  price: Price;
  ent: FullEntitlement;
  usage: number;
  prodName: string;
  org: Organization;
  proration?: Proration;
  now?: number;
  allowNegative?: boolean;
}) => {
  const config = price.config as UsagePriceConfig;
  const billingUnits = config.billing_units || 1;
  now = now || Date.now();

  let overageDescription = getFeatureInvoiceDescription({
    feature: ent.feature,
    usage: usage,
    billingUnits: billingUnits,
    prodName,
  });

  if (proration) {
    overageDescription = `${overageDescription} (from ${formatUnixToDate(now)})`;
  }

  // Get overage
  const overage = usage - ent.allowance!;

  let invoiceAmount = priceToInvoiceAmount({
    price,
    overage,
    proration,
    now,
  });

  if (!allowNegative && invoiceAmount < 0) {
    invoiceAmount = 0;
  }

  let newPreviewItem = constructPreviewItem({
    price,
    org,
    amount: invoiceAmount,
    description: overageDescription,
  });

  return newPreviewItem;
};
