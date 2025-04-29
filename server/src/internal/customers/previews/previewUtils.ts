import { Organization } from "@autumn/shared";

export const formatCurrency = ({
  amount,
  defaultCurrency,
}: {
  amount: number;
  defaultCurrency?: string;
}) => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: defaultCurrency || "usd",
  });
  return formatter.format(Math.abs(amount));
};

export const getItemsHtml = ({
  items,
  org,
}: {
  items: any[];
  org: Organization;
}) => {
  let html = "";
  let pricedItems = items.filter((item) => item.amount != 0);
  let totalAmount = pricedItems.reduce((acc: number, item: any) => {
    return acc + item.amount;
  }, 0);

  if (pricedItems.length == 1) {
    html += `<br/><p style="font-size: 1.1em;"><strong>${formatCurrency({
      amount: totalAmount,
      defaultCurrency: org.default_currency,
    })}</strong></p>`;
  } else {
    html += `<br/><ul>${itemsToHtml({ items: pricedItems })}</ul>`;
    html += `<br/><p style="font-size: 1.1em;">Total: ${formatCurrency({
      amount: totalAmount,
      defaultCurrency: org.default_currency,
    })}</p>`;
  }

  return html;
};

export const itemsToHtml = ({ items }: { items: any[] }) => {
  let html = "";

  for (let item of items) {
    if (item.amount == 0) {
      continue;
    }

    html += `<li>- ${item.name || item.description}: ${formatCurrency({
      amount: item.amount,
      defaultCurrency: item.currency,
    })}</li>`;
  }

  return html;
};
