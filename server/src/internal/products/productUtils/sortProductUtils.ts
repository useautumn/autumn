import { FullProduct, Product, ProductV2 } from "@autumn/shared";
import { isProductUpgrade } from "../productUtils.js";

export const sortProductsByPrice = ({
	products,
}: {
	products: FullProduct[];
}) => {
	products.sort((a, b) => {
		let isUpgradeA = isProductUpgrade({
			prices1: a.prices,
			prices2: b.prices,
			usageAlwaysUpgrade: false,
		});

		return isUpgradeA ? -1 : 1;
	});
};

export const sortFullProducts = ({ products }: { products: FullProduct[] }) => {
	return products.sort((a, b) => {
		if (a.group !== b.group) {
			return a.group < b.group ? -1 : 1;
		}

		if (a.is_add_on !== b.is_add_on) {
			return a.is_add_on ? 1 : -1;
		}

		const isUpgrade = isProductUpgrade({
			prices1: a.prices,
			prices2: b.prices,
			usageAlwaysUpgrade: false,
		});

		return isUpgrade ? -1 : 1;
	});
};
