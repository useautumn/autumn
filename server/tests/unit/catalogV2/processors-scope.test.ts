/**
 * Stripe price adoption (`price.processors`) is scoped to the catalog path.
 *
 * `validateAdoptedStripePrices` only runs in the catalogV2 init flow, so any
 * other path that persists a stated Stripe price id skips price creation
 * (`hasUsableStripeId` sees a non-null string) and fails much later as a Stripe
 * error at checkout instead of the documented hard error. Both price schemas
 * are therefore split the same way: `CreatePlanItemParamsV1Schema` and
 * `BasePriceParamsSchema` (attach / customize / migrations / licenses) have no
 * `processors`, and `CatalogPlanItemParamsV1Schema` /
 * `CatalogBasePriceParamsSchema` add it back for catalogV2 only.
 *
 * Red (before):  CreatePlanItemParamsV1Schema and BasePriceParamsSchema carried
 *                `processors`, so customize / multi-attach / updatePlanOp
 *                persisted the id.
 * Green (after): only the catalog schemas keep it; every other path strips it.
 */

import { describe, expect, test } from "bun:test";
import { BillingInterval, BillingMethod, ResetInterval } from "@autumn/shared";
import { MultiAttachParamsV0Schema } from "@autumn/shared/api/billing/attachV2/multiAttachParamsV0.js";
import { CustomizePlanV1Schema } from "@autumn/shared/api/billing/common/customizePlan/customizePlanV1.js";
import { CatalogBasePriceParamsSchema } from "@autumn/shared/api/catalogV2/planUpdate/params/catalogBasePriceParams.js";
import {
	type CatalogPlanItemParamsV1Input,
	CatalogPlanItemParamsV1Schema,
} from "@autumn/shared/api/catalogV2/planUpdate/params/catalogPlanItemParams.js";
import { UpdateCatalogPlanParamsSchema } from "@autumn/shared/api/catalogV2/planUpdate/params/catalogPlanParams.js";
import { MigrationUpdatePlanCustomizeSchema } from "@autumn/shared/api/migrations/operations/customer/updatePlan/updatePlanOp.js";
import { BasePriceParamsSchema } from "@autumn/shared/api/products/components/basePrice/basePrice.js";
import { basePriceToProductItem } from "@autumn/shared/api/products/components/basePrice/basePriceToProductItem.js";
import { CreatePlanItemParamsV1Schema } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1.js";
import { planItemV1ToV0 } from "@autumn/shared/api/products/items/mappers/planItemV1ToV0.js";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { features } from "@tests/utils/fixtures/db/features";

const ADOPTED_PRICE_ID = "price_adopted_from_stripe";

const basePrice = () => ({
	amount: 20,
	interval: BillingInterval.Month,
	processors: { stripe: { price_id: ADOPTED_PRICE_ID } },
});

const seatsItem = (): CatalogPlanItemParamsV1Input => ({
	feature_id: "seats",
	included: 1,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_units: 1,
		billing_method: BillingMethod.Prepaid,
		processors: { stripe: { price_id: ADOPTED_PRICE_ID } },
	},
});

describe("price.processors is catalog-only", () => {
	test("catalog item schema keeps the adopted price id", () => {
		const parsed = CatalogPlanItemParamsV1Schema.parse(seatsItem());
		expect(parsed.price?.processors?.stripe?.price_id).toBe(ADOPTED_PRICE_ID);
	});

	test("catalog plan params keep it through items[]", () => {
		const parsed = UpdateCatalogPlanParamsSchema.parse({
			plan_id: "pro",
			items: [seatsItem()],
		});
		expect(parsed.items?.[0].price?.processors?.stripe?.price_id).toBe(
			ADOPTED_PRICE_ID,
		);
	});

	test("the generic plan item schema strips it", () => {
		const parsed = CreatePlanItemParamsV1Schema.parse(seatsItem());
		expect(parsed.price).toBeDefined();
		expect(parsed.price).not.toHaveProperty("processors");
	});

	test("customize (items and add_items) strips it", () => {
		const put = CustomizePlanV1Schema.parse({ items: [seatsItem()] });
		expect(put.items?.[0].price).not.toHaveProperty("processors");

		const patch = CustomizePlanV1Schema.parse({ add_items: [seatsItem()] });
		expect(patch.add_items?.[0].price).not.toHaveProperty("processors");
	});

	test("multi-attach customize strips it", () => {
		const parsed = MultiAttachParamsV0Schema.parse({
			customer_id: "cus_1",
			plans: [{ plan_id: "pro", customize: { items: [seatsItem()] } }],
		});
		expect(parsed.plans[0].customize?.items?.[0].price).not.toHaveProperty(
			"processors",
		);
	});

	test("the updatePlan migration operation strips it", () => {
		const parsed = MigrationUpdatePlanCustomizeSchema.parse({
			add_items: [seatsItem()],
		});
		expect(parsed.add_items?.[0].price).not.toHaveProperty("processors");
	});
});

describe("the catalog item schema keeps the shared cross-field checks", () => {
	// `.extend()` drops zod checks, so the catalog variant re-runs
	// `planItemParamsIssues` rather than extending the finished schema.
	test("amount and tiers cannot both be set", () => {
		const result = CatalogPlanItemParamsV1Schema.safeParse({
			feature_id: "seats",
			price: {
				amount: 10,
				tiers: [{ to: "inf", amount: 5 }],
				interval: BillingInterval.Month,
				billing_method: BillingMethod.Prepaid,
			},
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			"'amount' and 'tiers' cannot both be defined in 'price'.",
		);
	});

	test("a price needs an amount or tiers", () => {
		const result = CatalogPlanItemParamsV1Schema.safeParse({
			feature_id: "seats",
			price: {
				interval: BillingInterval.Month,
				billing_method: BillingMethod.Prepaid,
			},
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			"If 'price' is present, either 'amount' or 'tiers' must be defined.",
		);
	});

	test("reset and price intervals can only differ for prepaid", () => {
		const result = CatalogPlanItemParamsV1Schema.safeParse({
			feature_id: "seats",
			included: 100,
			reset: { interval: ResetInterval.Month },
			price: {
				amount: 1,
				interval: BillingInterval.Year,
				billing_method: BillingMethod.UsageBased,
			},
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			"reset.interval and price.interval can only differ for prepaid prices.",
		);
	});
});

describe("catalog items still reach the product-item mapper", () => {
	test("planItemV1ToV0 carries the adopted price id", () => {
		const seatsFeature = features.create({
			id: "seats",
			internalId: "feat_internal_seats",
			name: "Seats",
		});
		const ctx = contexts.create({ features: [seatsFeature] });

		const item = CatalogPlanItemParamsV1Schema.parse(seatsItem());
		const planItemV0 = planItemV1ToV0({ ctx, item });

		expect(planItemV0.price?.processors?.stripe?.price_id).toBe(
			ADOPTED_PRICE_ID,
		);
	});
});

describe("base price.processors is catalog-only", () => {
	test("the catalog base price schema keeps the adopted price id", () => {
		const parsed = CatalogBasePriceParamsSchema.parse(basePrice());
		expect(parsed.processors?.stripe?.price_id).toBe(ADOPTED_PRICE_ID);
	});

	test("catalog plan params keep it through price", () => {
		const parsed = UpdateCatalogPlanParamsSchema.parse({
			plan_id: "pro",
			price: basePrice(),
		});
		expect(parsed.price?.processors?.stripe?.price_id).toBe(ADOPTED_PRICE_ID);
	});

	test("the generic base price schema strips it", () => {
		const parsed = BasePriceParamsSchema.parse(basePrice());
		expect(parsed.amount).toBe(20);
		expect(parsed).not.toHaveProperty("processors");
	});

	test("customize price strips it", () => {
		const parsed = CustomizePlanV1Schema.parse({ price: basePrice() });
		expect(parsed.price).not.toHaveProperty("processors");
	});

	test("multi-attach customize price strips it", () => {
		const parsed = MultiAttachParamsV0Schema.parse({
			customer_id: "cus_1",
			plans: [{ plan_id: "pro", customize: { price: basePrice() } }],
		});
		expect(parsed.plans[0].customize?.price).not.toHaveProperty("processors");
	});

	test("the updatePlan migration operation strips it from both price slots", () => {
		const parsed = MigrationUpdatePlanCustomizeSchema.parse({
			price: basePrice(),
			previous_price: basePrice(),
		});
		expect(parsed.price).not.toHaveProperty("processors");
		expect(parsed.previous_price).not.toHaveProperty("processors");
	});
});

describe("the catalog base price still reaches the product-item mapper", () => {
	test("basePriceToProductItem bills the adopted id from the v1 slot", () => {
		const ctx = contexts.create({});
		const price = CatalogBasePriceParamsSchema.parse(basePrice());

		const item = basePriceToProductItem({ ctx, basePrice: price });

		expect(item.stripe_price_id).toBe(ADOPTED_PRICE_ID);
	});
});
