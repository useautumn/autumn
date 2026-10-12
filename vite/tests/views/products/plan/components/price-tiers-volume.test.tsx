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
type VolumePricingMode =
	import("@/views/products/plan/utils/tierUtils").VolumePricingMode;

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

const render = ({
	item,
	volumePricingMode,
}: {
	item: ProductItem;
	volumePricingMode?: VolumePricingMode;
}) =>
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
			<PriceTiers volumePricingMode={volumePricingMode} />
		</ProductItemContext.Provider>,
	);

describe("PriceTiers wording", () => {
	test("graduated tiers keep the stacking wording", () => {
		const html = render({
			item: tieredItem({ tierBehavior: TierBehavior.Graduated }),
		});
		expect(html).toContain("then, up to");
		expect(html).not.toContain("volume:");
	});

	test("volume tiers drop graduated wording", () => {
		const html = render({
			item: tieredItem({ tierBehavior: TierBehavior.VolumeBased }),
			volumePricingMode: "per_unit",
		});
		expect(html).not.toContain("then, up to");
		expect(html).toContain("usage up to");
		expect(html).not.toContain("volume:");
	});
});
