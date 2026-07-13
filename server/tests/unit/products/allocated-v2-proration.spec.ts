import { describe, expect, test } from "bun:test";
import {
	AllocatedBillingBehavior,
	AllowanceType,
	AppEnv,
	BillingInterval,
	BillWhen,
	CusProductStatus,
	customerEntitlementShouldBeBilled,
	EntInterval,
	type Entitlement,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectHasUsageBasedAllocated,
	isAllocatedV2CustomerEntitlement,
	isUsageBasedAllocatedCustomerEntitlement,
	itemToAllocatedBillingBehavior,
	OnDecrease,
	OnIncrease,
	type Price,
	PriceType,
	type Product,
	type ProductItem,
	ProductItemInterval,
	type ProrationConfig,
	RolloverExpiryDurationType,
	TierInfinite,
	UsageModel,
	type UsagePriceConfig,
} from "@autumn/shared";
import { BillingMethod } from "@autumn/shared/api/products/components/billingMethod";
import { CreatePlanItemParamsV1Schema } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";
import { planItemV0ToProductItem } from "@autumn/shared/api/products/items/mappers/planItemV0ToProductItem";
import { planItemV1ToV0 } from "@autumn/shared/api/products/items/mappers/planItemV1ToV0";
import { itemsAreSame } from "@autumn/shared/utils/productV2Utils/compareProductUtils/compareItemUtils";
import { productItemToPlanItemParamsV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemParamsV1";
import { productItemsToPlanItemsV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemToPlanItemV1";
import { toProductItem } from "@autumn/shared/utils/productV2Utils/productItemUtils/mapToItem";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { handleNewProductItems } from "@/internal/products/product-items/productItemUtils/handleNewProductItems";

const orgId = "org_allocated_v2";
const now = 1_800_000_000_000;

const seatsFeature: Feature = {
	internal_id: "feat_internal_seats",
	id: "seats",
	name: "Seats",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Continuous },
	org_id: orgId,
	env: AppEnv.Sandbox,
	created_at: now,
	archived: false,
	event_names: [],
};

const messagesFeature: Feature = {
	...seatsFeature,
	internal_id: "feat_internal_messages",
	id: "messages",
	name: "Messages",
	config: { usage_type: FeatureUsageType.Single },
};

const features = [seatsFeature, messagesFeature];

const buildUsagePrice = ({
	shouldProrate,
	prorationConfig = null,
	interval = BillingInterval.Month,
	intervalCount = 1,
	omitAllocatedBillingBehavior = false,
}: {
	shouldProrate: boolean;
	prorationConfig?: ProrationConfig | null;
	interval?: BillingInterval;
	intervalCount?: number;
	omitAllocatedBillingBehavior?: boolean;
}): Price => ({
	id: "pr_prev",
	org_id: orgId,
	created_at: now,
	internal_product_id: "prod_internal_v1",
	is_custom: false,
	entitlement_id: "ent_prev",
	proration_config: prorationConfig,
	tier_behavior: null,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		should_prorate: shouldProrate,
		internal_feature_id: seatsFeature.internal_id,
		feature_id: seatsFeature.id,
		usage_tiers: [{ amount: 10, to: TierInfinite }],
		interval,
		interval_count: intervalCount,
		...(omitAllocatedBillingBehavior
			? {}
			: {
					allocated_billing_behavior: shouldProrate
						? AllocatedBillingBehavior.Prorated
						: AllocatedBillingBehavior.Arrear,
				}),
	} satisfies UsagePriceConfig,
});

const seatsItem = (overrides: Partial<ProductItem> = {}): ProductItem => ({
	feature_id: seatsFeature.id,
	included_usage: 2,
	price: 10,
	interval: ProductItemInterval.Month,
	interval_count: 1,
	usage_model: UsageModel.PayPerUse,
	billing_units: 1,
	...overrides,
});

describe("itemToAllocatedBillingBehavior", () => {
	test("explicit allocated billing behavior always wins", () => {
		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem({
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
					},
				}),
				features,
			}),
		).toBe(AllocatedBillingBehavior.Arrear);

		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem({
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
					},
				}),
				features,
			}),
		).toBe(AllocatedBillingBehavior.Prorated);
	});

	test("proration knobs imply prorated allocated billing", () => {
		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem({
					config: {
						on_increase: OnIncrease.BillImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
				features,
			}),
		).toBe(AllocatedBillingBehavior.Prorated);
	});

	test("inherits from curPrice when the item carries no signal", () => {
		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem(),
				features,
				curPrice: buildUsagePrice({ shouldProrate: true }),
			}),
		).toBe(AllocatedBillingBehavior.Prorated);

		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem(),
				features,
				curPrice: buildUsagePrice({ shouldProrate: false }),
			}),
		).toBe(AllocatedBillingBehavior.Arrear);
	});

	test("brand-new items default to allocated arrear billing", () => {
		expect(
			itemToAllocatedBillingBehavior({ item: seatsItem(), features }),
		).toBe(AllocatedBillingBehavior.Arrear);
	});

	test("not applicable for prepaid or single-use items", () => {
		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem({ usage_model: UsageModel.Prepaid }),
				features,
			}),
		).toBeNull();

		expect(
			itemToAllocatedBillingBehavior({
				item: seatsItem({ feature_id: messagesFeature.id }),
				features,
			}),
		).toBeNull();
	});

	test("rejects proration knobs for allocated arrear billing", () => {
		expect(() =>
			itemToAllocatedBillingBehavior({
				item: seatsItem({
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
						on_increase: OnIncrease.BillImmediately,
					},
				}),
				features,
			}),
		).toThrow("on_increase / on_decrease are not supported");
	});

	test("rejects rollover for allocated arrear billing", () => {
		expect(() =>
			itemToAllocatedBillingBehavior({
				item: seatsItem({
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
						rollover: {
							max: 100,
							duration: RolloverExpiryDurationType.Month,
							length: 1,
						},
					},
				}),
				features,
			}),
		).toThrow("rollover is not supported");
	});
});

describe("itemsAreSame allocated billing behavior comparison", () => {
	test("detects one-sided explicit arrear behavior", () => {
		const result = itemsAreSame({
			item1: seatsItem({
				config: {
					allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
				},
			}),
			item2: seatsItem(),
			features,
		});

		expect(result.same).toBe(false);
		expect(result.pricesChanged).toBe(true);
	});

	test("keeps omitted behavior equal on both sides", () => {
		const result = itemsAreSame({
			item1: seatsItem(),
			item2: seatsItem(),
			features,
		});

		expect(result.same).toBe(true);
		expect(result.pricesChanged).toBe(false);
	});

	test("treats one-sided explicit prorated behavior as omitted", () => {
		const result = itemsAreSame({
			item1: seatsItem({
				config: {
					allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
				},
			}),
			item2: seatsItem(),
			features,
		});

		expect(result.same).toBe(true);
		expect(result.pricesChanged).toBe(false);
	});
});

describe("public plan item proration boundary", () => {
	test("allocated usage-based responses omit proration", () => {
		const [planItem] = productItemsToPlanItemsV1({
			items: [
				seatsItem({
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Prorated,
						on_increase: OnIncrease.BillImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
			],
			features,
		});

		expect(planItem?.proration).toBeUndefined();
	});

	test("public usage-based inputs reject proration", () => {
		const result = CreatePlanItemParamsV1Schema.safeParse({
			feature_id: seatsFeature.id,
			included: 0,
			unlimited: false,
			price: {
				amount: 10,
				interval: BillingInterval.Month,
				billing_units: 1,
				billing_method: BillingMethod.UsageBased,
				max_purchase: null,
			},
			proration: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(
			"proration is only supported for prepaid features.",
		);
	});

	test("old API allocated items synthesize internal proration", () => {
		const planItem = productItemToPlanItemParamsV1({
			ctx: { features, expand: [] } as never,
			item: seatsItem({
				config: {
					on_increase: OnIncrease.BillImmediately,
					on_decrease: OnDecrease.None,
				},
			}),
		});

		expect(planItem.proration).toEqual({
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		});

		const planItemV0 = planItemV1ToV0({
			ctx: { features } as never,
			item: planItem,
		});
		const item = planItemV0ToProductItem({
			ctx: { features } as never,
			planItem: planItemV0,
		});

		expect(item.config?.on_increase).toBe(OnIncrease.BillImmediately);
		expect(item.config?.on_decrease).toBe(OnDecrease.None);
		expect(item.config?.allocated_billing_behavior).toBeUndefined();
	});

	test("old API allocated rollover also stays legacy prorated", () => {
		const planItem = productItemToPlanItemParamsV1({
			ctx: { features, expand: [] } as never,
			item: seatsItem({
				config: {
					rollover: {
						max: 10,
						duration: RolloverExpiryDurationType.Month,
						length: 1,
					},
				},
			}),
		});

		expect(planItem.rollover).toBeDefined();
		expect(planItem.proration).toEqual({
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.Prorate,
		});
	});

	test("public allocated rollover without proration is rejected", () => {
		expect(() =>
			planItemV1ToV0({
				ctx: { features } as never,
				item: {
					feature_id: seatsFeature.id,
					included: 0,
					unlimited: false,
					reset: null,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						max_purchase: null,
					},
					rollover: {
						max: 10,
						expiry_duration_type: RolloverExpiryDurationType.Month,
						expiry_duration_length: 1,
					},
				},
			}),
		).toThrow("rollover requires proration");
	});
});

const previousEntitlement: Entitlement = {
	id: "ent_prev",
	org_id: orgId,
	created_at: now,
	is_custom: false,
	internal_product_id: "prod_internal_v1",
	internal_feature_id: seatsFeature.internal_id,
	feature_id: seatsFeature.id,
	allowance: 2,
	allowance_type: AllowanceType.Fixed,
	interval: EntInterval.Lifetime,
	interval_count: 1,
	carry_from_previous: true,
	entity_feature_id: undefined,
	usage_limit: null,
	rollover: null,
};

const newProduct: Product = {
	id: "pro",
	name: "Pro",
	description: null,
	is_add_on: false,
	is_default: false,
	version: 2,
	group: "",
	env: AppEnv.Sandbox,
	internal_id: "prod_internal_v2",
	org_id: orgId,
	created_at: now,
	processor: null,
	base_variant_id: null,
	archived: false,
	config: { ignore_past_due: false },
	metadata: {},
};

const noopLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => noopLogger,
} as never;

const runHandleNewProductItems = ({
	curPrices,
	curEnts,
	newItems,
}: {
	curPrices: Price[];
	curEnts: Entitlement[];
	newItems: ProductItem[];
}) =>
	handleNewProductItems({
		db: {} as DrizzleCli,
		curPrices,
		curEnts,
		newItems,
		features: [seatsFeature],
		product: newProduct,
		logger: noopLogger,
		isCustom: false,
		newVersion: true,
		saveToDb: false,
		multiCurrencyEnabled: true,
	});

describe("handleNewProductItems allocated v2 inheritance", () => {
	test("dashboard-style customize update preserves legacy allocated billing", async () => {
		const previousPrice = buildUsagePrice({
			shouldProrate: true,
			omitAllocatedBillingBehavior: true,
			prorationConfig: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});
		const dashboardItem = toProductItem({
			ent: { ...previousEntitlement, feature: seatsFeature } as never,
			price: previousPrice,
		});

		expect(dashboardItem.config?.allocated_billing_behavior).toBe(
			AllocatedBillingBehavior.Prorated,
		);

		const result = await runHandleNewProductItems({
			curPrices: [previousPrice],
			curEnts: [previousEntitlement],
			newItems: [dashboardItem],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(true);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Prorated);
		expect(newPrice.proration_config).not.toBeNull();
	});

	test("plan edit with no proration signal keeps the prorated model (no silent flip)", async () => {
		const previousPrice = buildUsagePrice({
			shouldProrate: true,
			prorationConfig: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const result = await runHandleNewProductItems({
			curPrices: [previousPrice],
			curEnts: [previousEntitlement],
			newItems: [
				seatsItem({
					price: 15,
					price_id: previousPrice.id,
					entitlement_id: previousEntitlement.id,
				}),
			],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(true);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Prorated);
		expect(newPrice.proration_config).not.toBeNull();
	});

	test("plan edit without price_id defaults to allocated v2", async () => {
		const previousPrice = buildUsagePrice({ shouldProrate: true });

		const result = await runHandleNewProductItems({
			curPrices: [previousPrice],
			curEnts: [previousEntitlement],
			newItems: [seatsItem({ price: 15 })],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(false);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Arrear);
	});

	test("explicit arrear behavior switches the item to allocated v2", async () => {
		const previousPrice = buildUsagePrice({ shouldProrate: true });

		const result = await runHandleNewProductItems({
			curPrices: [previousPrice],
			curEnts: [previousEntitlement],
			newItems: [
				seatsItem({
					price_id: previousPrice.id,
					entitlement_id: previousEntitlement.id,
					config: {
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
					},
				}),
			],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(false);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Arrear);
		expect(newPrice.proration_config).toBeNull();
	});

	test("brand-new continuous-use item defaults to allocated v2", async () => {
		const result = await runHandleNewProductItems({
			curPrices: [],
			curEnts: [],
			newItems: [seatsItem()],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(false);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Arrear);
		expect(newPrice.proration_config).toBeNull();
	});

	test("brand-new item with proration knobs stays prorated", async () => {
		const result = await runHandleNewProductItems({
			curPrices: [],
			curEnts: [],
			newItems: [
				seatsItem({
					config: {
						on_increase: OnIncrease.BillImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
			],
		});

		const newPrice = result.prices[0];
		expect((newPrice.config as UsagePriceConfig).should_prorate).toBe(true);
		expect(
			(newPrice.config as UsagePriceConfig).allocated_billing_behavior,
		).toBe(AllocatedBillingBehavior.Prorated);
	});
});

const buildCusEnt = ({
	price,
	nextResetAt = null,
}: {
	price: Price;
	nextResetAt?: number | null;
}): FullCusEntWithFullCusProduct => {
	const customerProductId = "cp_1";

	return {
		id: "ce_1",
		customer_product_id: customerProductId,
		next_reset_at: nextResetAt,
		entitlement: {
			...previousEntitlement,
			id: price.entitlement_id,
			feature: seatsFeature,
		},
		customer_product: {
			id: customerProductId,
			customer_prices: [
				{
					id: "cpr_1",
					customer_product_id: customerProductId,
					price,
				},
			],
		},
	} as unknown as FullCusEntWithFullCusProduct;
};

const anchorMs = Date.UTC(2026, 0, 15);
const oneMonthLaterMs = Date.UTC(2026, 1, 15);
const oneYearLaterMs = Date.UTC(2027, 0, 15);

describe("customerEntitlementShouldBeBilled for allocated v2", () => {
	test("bills at the price's billing cycle boundary", () => {
		const cusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: false }),
		});

		expect(
			customerEntitlementShouldBeBilled({
				cusEnt,
				invoicePeriodEndMs: oneMonthLaterMs,
				billingCycleAnchorMs: anchorMs,
			}),
		).toBe(true);
	});

	test("not billed without a billing cycle anchor", () => {
		const cusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: false }),
		});

		expect(
			customerEntitlementShouldBeBilled({
				cusEnt,
				invoicePeriodEndMs: oneMonthLaterMs,
			}),
		).toBe(false);
	});

	test("yearly item on a monthly cycle bills only at the year boundary", () => {
		const cusEnt = buildCusEnt({
			price: buildUsagePrice({
				shouldProrate: false,
				interval: BillingInterval.Year,
			}),
		});

		expect(
			customerEntitlementShouldBeBilled({
				cusEnt,
				invoicePeriodEndMs: oneMonthLaterMs,
				billingCycleAnchorMs: anchorMs,
			}),
		).toBe(false);

		expect(
			customerEntitlementShouldBeBilled({
				cusEnt,
				invoicePeriodEndMs: oneYearLaterMs,
				billingCycleAnchorMs: anchorMs,
			}),
		).toBe(true);
	});

	test("v1 allocated (prorated) cusEnts are never billed at invoice.created", () => {
		const cusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: true }),
		});

		expect(
			customerEntitlementShouldBeBilled({
				cusEnt,
				invoicePeriodEndMs: oneMonthLaterMs,
				billingCycleAnchorMs: anchorMs,
			}),
		).toBe(false);
	});
});

describe("allocated cusEnt classifiers", () => {
	test("v2 cusEnts are allocatedV2, not usage-based allocated", () => {
		const allocatedV2CusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: false }),
		});

		expect(isAllocatedV2CustomerEntitlement(allocatedV2CusEnt)).toBe(true);
		expect(isUsageBasedAllocatedCustomerEntitlement(allocatedV2CusEnt)).toBe(
			false,
		);
	});

	test("v1 cusEnts are usage-based allocated, not allocatedV2", () => {
		const allocatedV1CusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: true }),
		});

		expect(isAllocatedV2CustomerEntitlement(allocatedV1CusEnt)).toBe(false);
		expect(isUsageBasedAllocatedCustomerEntitlement(allocatedV1CusEnt)).toBe(
			true,
		);
	});

	test("fullSubject paid allocated guard excludes allocated v2", () => {
		const allocatedV2CusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: false }),
		});
		const allocatedV1CusEnt = buildCusEnt({
			price: buildUsagePrice({ shouldProrate: true }),
		});

		const fullSubjectWithCusEnt = (
			cusEnt: FullCusEntWithFullCusProduct,
		): FullSubject =>
			({
				subjectType: "customer",
				customerId: "cus_1",
				internalCustomerId: "cus_internal_1",
				customer_products: [
					{
						...cusEnt.customer_product,
						status: CusProductStatus.Active,
						customer_entitlements: [cusEnt],
					},
				],
				extra_customer_entitlements: [],
			}) as unknown as FullSubject;

		expect(
			fullSubjectHasUsageBasedAllocated({
				fullSubject: fullSubjectWithCusEnt(allocatedV2CusEnt),
				features: [seatsFeature],
			}),
		).toBe(false);

		expect(
			fullSubjectHasUsageBasedAllocated({
				fullSubject: fullSubjectWithCusEnt(allocatedV1CusEnt),
				features: [seatsFeature],
			}),
		).toBe(true);
	});
});
