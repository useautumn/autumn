import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillingMethod,
	type Feature,
	FeatureType,
	FeatureUsageType,
	PriceType,
} from "@autumn/shared";
import { CreatePlanItemParamsV1Schema } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";
import { planItemV0ToProductItem } from "@autumn/shared/api/products/items/mappers/planItemV0ToProductItem";
import { planItemV1ToPriceAndEnt } from "@autumn/shared/api/products/items/mappers/planItemV1ToPriceAndEnt";
import { planItemV1ToV0 } from "@autumn/shared/api/products/items/mappers/planItemV1ToV0";
import { productItemToPlanItemParamsV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemParamsV1";
import { itemToPriceAndEnt as serverItemToPriceAndEnt } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt";

const feature: Feature = {
	internal_id: "feat_internal_emails",
	id: "emails",
	name: "Emails",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	org_id: "org_test",
	env: AppEnv.Sandbox,
	created_at: 1_800_000_000_000,
	archived: false,
	event_names: [],
};

const ctx = { features: [feature], expand: [] } as never;

describe("custom feature Stripe price", () => {
	test("survives the plan item materialization path", () => {
		const planItem = CreatePlanItemParamsV1Schema.parse({
			feature_id: "emails",
			included: 1_500_000,
			reset: { interval: "month" },
			price: {
				stripe_price_id: "price_enterprise_overage",
				amount: 0.47,
				interval: BillingInterval.Month,
				billing_units: 1000,
				billing_method: BillingMethod.UsageBased,
			},
		});

		const planItemV0 = planItemV1ToV0({ ctx, item: planItem });
		const productItem = planItemV0ToProductItem({ ctx, planItem: planItemV0 });
		const { newPrice } = planItemV1ToPriceAndEnt({
			ctx,
			item: planItem,
			orgId: "org_test",
			internalProductId: "prod_internal_enterprise",
			isCustom: true,
		});
		const { newPrice: serverNewPrice } = serverItemToPriceAndEnt({
			item: productItem,
			orgId: "org_test",
			internalProductId: "prod_internal_enterprise",
			feature,
			isCustom: true,
			features: [feature],
		});

		expect(planItemV0.price?.stripe_price_id).toBe("price_enterprise_overage");
		expect(productItem.stripe_price_id).toBe("price_enterprise_overage");
		expect(newPrice?.config.type).toBe(PriceType.Usage);
		expect(newPrice?.config.stripe_price_id).toBe("price_enterprise_overage");
		expect(serverNewPrice?.config.stripe_price_id).toBe(
			"price_enterprise_overage",
		);
		expect(
			productItemToPlanItemParamsV1({ ctx, item: productItem }).price
				?.stripe_price_id,
		).toBe("price_enterprise_overage");
	});
});
