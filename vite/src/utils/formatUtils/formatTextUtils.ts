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

export const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^\w\s-]/g, "");
};

export const formatAmount = ({
  amount,
  currency,
}: {
  amount: number;
  currency: string;
}) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 10,
  }).format(amount);
};
