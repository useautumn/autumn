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
  return text.toLowerCase().replace(/ /g, "_");
};

export const formatCurrency = (amount: number, currency: string = "USD") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(amount);
};
