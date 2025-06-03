import { Organization } from "@autumn/shared";

export const formatAmount = ({
  org,
  amount,
  maxFractionDigits = 2,
}: {
  org?: Organization;
  amount: number;
  maxFractionDigits?: number;
}) => {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: org?.default_currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};
