import {
  BillingInterval,
  EntInterval,
  ProductItemInterval,
} from "@autumn/shared";

export const keyToTitle = (key: string) => {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const keyToTitleFirstCaps = (key: string) => {
  // Capitalize first char
  const res = key.replace(/^\w/, (char) => char.toUpperCase());
  // Replace underscores with spaces
  return res.replace(/_/g, " ");
};

export const slugify = (
  text: string,
  type: "underscore" | "dash" = "underscore"
) => {
  return text
    .toLowerCase()
    .replace(/ /g, type == "underscore" ? "_" : "-")
    .replace(/[^\w\s-]/g, "");
};

export const formatAmount = ({
  amount,
  currency,
  maxFractionDigits = 10,
}: {
  amount: number;
  currency: string;
  maxFractionDigits?: number;
}) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(amount);
};

export const formatIntervalText = ({
  interval,
  intervalCount,
  billingInterval,
  isBillingInterval = false,
}: {
  interval?: EntInterval;
  billingInterval?: BillingInterval;
  intervalCount?: number;
  isBillingInterval?: boolean;
}) => {
  const finalInterval = interval ?? billingInterval;
  if (finalInterval == null) {
    return "";
  }

  if (finalInterval === BillingInterval.OneOff) {
    return "one off";
  }
  if (finalInterval === EntInterval.Lifetime) {
    return "no reset";
  }
  if (intervalCount && intervalCount > 1) {
    return `per ${intervalCount} ${finalInterval}s`;
  }
  return finalInterval === BillingInterval.SemiAnnual
    ? "per half year"
    : `per ${finalInterval}`;
};
