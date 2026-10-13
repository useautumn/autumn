import { describe, expect, mock, test } from "bun:test";
import {
	Infinite,
	type PriceTier,
	type ProductItem,
	TierBehavior,
} from "@autumn/shared";

mock.module("@/hooks/common/useOrg", () => ({
	useOrg: () => ({ org: { default_currency: "usd", config: {} } }),
}));
mock.module("@/hooks/queries/useFeaturesQuery", () => ({
	useFeaturesQuery: () => ({ features: [] }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { ProductItemContext } = await import(
	"@/views/products/product/product-item/ProductItemContext"
);
const { PriceTiers } = await import(
	"@/views/products/plan/components/edit-plan-feature/PriceTiers"
);

const tieredItem = ({
	tierBehavior,
	tiers = [
		{ to: 100, amount: 1 },
		{ to: Infinite, amount: 0.5 },
	],
}: {
	tierBehavior: TierBehavior;
	tiers?: PriceTier[];
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		tier_behavior: tierBehavior,
		tiers,
	}) as ProductItem;

const render = ({ item }: { item: ProductItem }) =>
	renderToStaticMarkup(
		<ProductItemContext.Provider
			value={{
				item,
				setItem: () => {},
				selectedIndex: 0,
				showCreateFeature: false,
				setShowCreateFeature: () => {},
				isUpdate: true,
				handleUpdateProductItem: async () => null,
			}}
		>
			<PriceTiers />
		</ProductItemContext.Provider>,
	);

describe("PriceTiers table", () => {
	test("graduated tiers have no flat fee column or example bill", () => {
		const html = render({
			item: tieredItem({ tierBehavior: TierBehavior.Graduated }),
		});
		expect(html).toContain("included free");
		expect(html).toContain("Unlimited");
		expect(html).not.toContain("Flat fee");
		expect(html).not.toContain("Example bill");
	});

	test("volume shows included usage above the table and the example bill", () => {
		const html = render({
			item: tieredItem({ tierBehavior: TierBehavior.VolumeBased }),
		});
		expect(html).toContain("First 100");
		expect(html).toContain("Example bill");
		expect(html).not.toContain("Free until exceeded");
		expect(html).not.toContain("volume: past 100");
	});

	test("each volume tier is one row with its rate and an optional flat fee", () => {
		const html = render({
			item: tieredItem({
				tierBehavior: TierBehavior.VolumeBased,
				tiers: [
					{ to: 100, amount: 1, flat_amount: 5 },
					{ to: Infinite, amount: 0.5 },
				],
			}),
		});
		expect(html.match(/value="1"/g)).toHaveLength(1);
		expect(html.match(/value="5"/g)).toHaveLength(1);
		expect(html.match(/value="0.5"/g)).toHaveLength(1);
		expect(html.match(/placeholder="—"/g)).toHaveLength(2);
	});
});
