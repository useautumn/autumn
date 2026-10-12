import { describe, expect, mock, test } from "bun:test";
import {
	Infinite,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";

mock.module("@/hooks/queries/useFeaturesQuery", () => ({
	useFeaturesQuery: () => ({ features: [] }),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { ProductItemContext } = await import(
	"@/views/products/product/product-item/ProductItemContext"
);
const { PricedFeatureSettings } = await import(
	"@/views/products/plan/components/edit-plan-feature/PricedFeatureSettings"
);

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
			<PricedFeatureSettings />
		</ProductItemContext.Provider>,
	);

describe("PricedFeatureSettings with volume tiers", () => {
	test("usage-based billing stays selectable for a multi-tier volume item", () => {
		const markup = render({
			item: {
				feature_id: "messages",
				interval: ProductItemInterval.Month,
				usage_model: UsageModel.PayPerUse,
				tier_behavior: TierBehavior.VolumeBased,
				tiers: [
					{ to: 100, amount: 1 },
					{ to: Infinite, amount: 0.5 },
				],
			} as ProductItem,
		});

		// A disabled option dims its label.
		expect(markup).toContain(
			'<span class="text-checkbox-label">Usage-based</span>',
		);
	});
});
