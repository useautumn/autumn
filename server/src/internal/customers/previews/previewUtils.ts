import type { Organization, PriceTier } from "@autumn/shared";

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
	return formatter.format(amount);
};

export const formatTiers = ({
	tiers,

	org,
}: {
	tiers: PriceTier[];

	org: Organization;
}) => {
	if (tiers.length == 1) {
		return formatCurrency({
			amount: tiers[0].amount,
			defaultCurrency: org.default_currency!,
		});
	}

	const tiersStart = formatCurrency({
		amount: tiers[0].amount,
		defaultCurrency: org.default_currency!,
	});
	const tiersEnd = formatCurrency({
		amount: tiers[tiers.length - 1].amount,
		defaultCurrency: org.default_currency!,
	});

	return `${tiersStart} - ${tiersEnd}`;
};

export const getItemsHtml = ({
	items,
	org,
}: {
	items: any[];
	org: Organization;
}) => {
	let html = "";
	const pricedItems = items.filter((item) => item.amount != 0);
	const totalAmount = pricedItems.reduce((acc: number, item: any) => {
		return acc + item.amount;
	}, 0);

	if (pricedItems.length == 1) {
		html += `<br/><p style="font-size: 1.1em;"><strong>${formatCurrency({
			amount: totalAmount,
			defaultCurrency: org.default_currency!,
		})}</strong></p>`;
	} else {
		html += `<br/><ul>${itemsToHtml({ items: pricedItems })}</ul>`;
		html += `<br/><p style="font-size: 1.1em;">Total: ${formatCurrency({
			amount: totalAmount,
			defaultCurrency: org.default_currency!,
		})}</p>`;
	}

	return html;
};

export const itemsToHtml = ({ items }: { items: any[] }) => {
	let html = "";

	for (const item of items) {
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
