import { Organization } from "@autumn/shared";

export const formatAmount = ({
  org,
  currency,
  amount,
  maxFractionDigits = 2,
  minFractionDigits = 0,
}: {
  org?: Organization;
  currency?: string | null;
  amount: number;
  maxFractionDigits?: number;
  minFractionDigits?: number;
}) => {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || org?.default_currency || "USD",
    minimumFractionDigits: minFractionDigits || 0,
    maximumFractionDigits: maxFractionDigits || 2,
  }).format(amount);
};
