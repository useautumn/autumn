import { Organization, Feature, FullProduct, EntitlementWithFeature, ProductItemInterval, AllowanceType } from "@autumn/shared";
import { getProductItemDisplay } from "@shared/utils/productDisplayUtils.js";
import { getFeatureName } from "@shared/utils/displayUtils.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";

export const buildInvoiceMemo = async ({
	org,
	product,
	products,
	features,
}: {
	org: Organization;
	product?: FullProduct;
	products?: FullProduct[];
	features: Feature[];
}): Promise<string> => {
	if (product) {
		const items = mapToProductItems({
			prices: product.prices,
			entitlements: product.entitlements,
			features,
		});

		const itemsToDisplay = ["Included features:"];
		for (const item of items) {
			if (!item.feature_id) continue;
			const display = getProductItemDisplay({
				item,
				features,
				currency: org.default_currency,
			});
			if (display?.primary_text) itemsToDisplay.push(display.primary_text);
		}


		console.log("Items to display: %s", itemsToDisplay);
		return itemsToDisplay.join("\n");
	} else if (products) {
		const itemsToDisplay = ["Included features:"];

		for (const p of products) {
			console.log("Product: %s", p.name);
			const items = mapToProductItems({
				prices: p.prices,
				entitlements: p.entitlements,
				features,
			});

			console.log("Items: %s", items.map(i => i.feature_id));

			for (const item of items) {
				if (!item.feature_id) continue;
				const display = getProductItemDisplay({
					item,
					features,
					currency: org.default_currency,
				});
                console.log("Display for item %s: %s", item.feature_id, display?.primary_text);
				if (display?.primary_text) itemsToDisplay.push(display.primary_text);
			}
		}

        console.log("Items to display: %s", itemsToDisplay);

		let memo = itemsToDisplay.join("\n");
		if (memo.length > 490) {
			memo = memo.slice(0, 490) + "...";
		}
		return memo;
	} else return "";
};

export const buildInvoiceMemoFromEntitlements = async ({
	org,
	entitlements,
	features,
}: {
	org: Organization;
	entitlements: EntitlementWithFeature[];
	features: Feature[];
}) => {
    const itemsToDisplay = ["Included features:"];

    for (const entitlement of entitlements) {
        const feature = entitlement.feature || features.find((f) => f.id === entitlement.feature_id);
        if (!feature) continue;

        let line = " - ";
        if (entitlement.allowance_type === AllowanceType.Unlimited) {
            const name = getFeatureName({ feature, plural: true, capitalize: true });
            line += `Unlimited ${name}`;
        } else if (entitlement.allowance_type === AllowanceType.Fixed) {
            const allowance = entitlement.allowance ?? 0;
            const plural = allowance !== 1;
            const name = getFeatureName({ feature, plural, capitalize: true });
            line += `${allowance}x ${name}`;
        } else {
            const name = getFeatureName({ feature, plural: false, capitalize: true });
            line += name;
        }

        itemsToDisplay.push(line);
    }

    let memo = itemsToDisplay.join("\n");
    if (memo.length > 490) {
        memo = memo.slice(0, 490) + "...";
    }
    return memo;
}