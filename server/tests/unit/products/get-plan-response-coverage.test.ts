import { describe, expect, test } from "bun:test";
import {
	type ApiPlanExpandedV1,
	AppEnv,
	BillingInterval,
	BillingMethod,
	EntInterval,
	type EntitlementWithFeature,
	FeatureUsageType,
	FreeTrialDuration,
	type FullPlanLicense,
	type FullProduct,
	type Price,
	ResetInterval,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

/**
 * What a plan response is made of, field by field. Every case goes through
 * getPlanResponse, the entry every caller uses, with no ctx: the pure path.
 */

const onProduct = <Row extends { internal_product_id?: string | null }>({
	product,
	row,
}: {
	product: { internal_id: string };
	row: Row;
}): Row => ({ ...row, internal_product_id: product.internal_id });

const messagesEntitlement = (): EntitlementWithFeature =>
	entitlements.create({
		id: "ent_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		interval: EntInterval.Month,
		featureConfig: { usage_type: FeatureUsageType.Single },
	}) as EntitlementWithFeature;

/** A product whose prices and entitlements all sit on it, the way a stored plan's do. */
const planOf = ({
	id = "pro",
	name = "Pro",
	planPrices = [],
	planEntitlements = [],
	overrides = {},
}: {
	id?: string;
	name?: string;
	planPrices?: Price[];
	planEntitlements?: EntitlementWithFeature[];
	overrides?: Partial<FullProduct>;
} = {}): FullProduct => {
	const product = products.createFull({ id, name });
	return {
		...product,
		prices: planPrices.map((row) => onProduct({ product, row })),
		entitlements: planEntitlements.map((row) => onProduct({ product, row })),
		...overrides,
	};
};

const featuresOf = ({ product }: { product: FullProduct }) =>
	product.entitlements.map((entitlement) => entitlement.feature);

const render = ({
	product,
	...rest
}: { product: FullProduct } & Partial<
	Parameters<typeof getPlanResponse>[0]
>): Promise<ApiPlanExpandedV1> =>
	getPlanResponse({ product, features: featuresOf({ product }), ...rest });

const licenseLink = ({
	parent,
	licenseProduct,
	overrides = {},
}: {
	parent: FullProduct;
	licenseProduct: FullProduct;
	overrides?: Partial<FullPlanLicense>;
}): FullPlanLicense => ({
	id: `license_${parent.id}_${licenseProduct.id}`,
	parent_internal_product_id: parent.internal_id,
	is_custom: false,
	license_internal_product_id: licenseProduct.internal_id,
	included: 2,
	prepaid_only: true,
	customized: false,
	metadata: null,
	created_at: 1,
	updated_at: 1,
	product: licenseProduct,
	...overrides,
});

describe("plan fields", () => {
	test("copies the plan's identity and flags", async () => {
		const plan = await render({
			product: planOf({
				overrides: { is_add_on: true, is_default: true, version: 3 },
			}),
		});

		expect(plan).toMatchObject({
			id: "pro",
			internal_id: "internal_pro",
			name: "Pro",
			version: 3,
			version_slug: "v1",
			active: true,
			add_on: true,
			auto_enable: true,
			archived: false,
			base_variant_id: null,
		});
	});

	test("blank name, description and group read as empty, null and null", async () => {
		const plan = await render({
			product: planOf({
				overrides: { name: "", description: null, group: "" },
			}),
		});

		expect(plan.name).toBe("");
		expect(plan.description).toBeNull();
		expect(plan.group).toBeNull();
	});

	test("missing config, metadata and env fall back to their defaults", async () => {
		const plan = await render({
			product: planOf({
				overrides: {
					config: undefined,
					metadata: undefined,
					env: undefined,
				} as unknown as Partial<FullProduct>,
			}),
		});

		expect(plan.config).toEqual({ ignore_past_due: false });
		expect(plan.metadata).toEqual({});
		expect(plan.env).toBe(AppEnv.Sandbox);
	});

	test("keeps the base variant a plan belongs to", async () => {
		const plan = await render({
			product: planOf({ overrides: { base_variant_id: "pro_family" } }),
		});

		expect(plan.base_variant_id).toBe("pro_family");
	});

	test("has no customer eligibility when no customer is given", async () => {
		const plan = await render({ product: planOf() });

		expect(plan.customer_eligibility).toBeUndefined();
	});
});

describe("base price", () => {
	test("a plan with no fixed price has a null price", async () => {
		const plan = await render({ product: planOf() });

		expect(plan.price).toBeNull();
	});

	test("a monthly fixed price reads as amount, interval, display and its Stripe price", async () => {
		const plan = await render({
			product: planOf({
				planPrices: [prices.createFixed({ id: "pr_base" })],
			}),
		});

		expect(plan.price).toEqual({
			amount: 100,
			interval: BillingInterval.Month,
			price_id: "pr_base",
			display: { primary_text: "$100", secondary_text: "per month" },
			processors: { stripe: { price_id: "stripe_price_pr_base" } },
		});
	});

	test("an interval count of one is left out, any other is kept", async () => {
		const quarterly = prices.createFixed({ id: "pr_base" });
		const plan = await render({
			product: planOf({
				planPrices: [
					{
						...quarterly,
						config: { ...quarterly.config, interval_count: 3 },
					} as Price,
				],
			}),
		});

		expect(plan.price?.interval_count).toBe(3);
	});

	test("a price that never reached Stripe names no processor", async () => {
		const unsynced = prices.createFixed({ id: "pr_base" });
		const plan = await render({
			product: planOf({
				planPrices: [
					{
						...unsynced,
						config: { ...unsynced.config, stripe_price_id: null },
					} as Price,
				],
			}),
		});

		expect(plan.price?.processors).toBeUndefined();
	});

	test("the display follows the requested currency", async () => {
		const plan = await render({
			product: planOf({ planPrices: [prices.createFixed({ id: "pr_base" })] }),
			currency: "eur",
		});

		expect(plan.price?.display?.primary_text).toBe("€100");
	});
});

describe("items", () => {
	test("an entitlement alone is an included-usage item", async () => {
		const plan = await render({
			product: planOf({ planEntitlements: [messagesEntitlement()] }),
		});

		expect(plan.items).toHaveLength(1);
		expect(plan.items[0]).toMatchObject({
			feature_id: "messages",
			included: 100,
			price: null,
		});
		expect(plan.items[0].reset?.interval).toBe(ResetInterval.Month);
	});

	test("an entitlement with its usage price is one priced item", async () => {
		const plan = await render({
			product: planOf({
				planEntitlements: [messagesEntitlement()],
				planPrices: [
					prices.createConsumable({
						id: "pr_messages",
						featureId: "messages",
						entitlementId: "ent_messages",
					}),
				],
			}),
		});

		expect(plan.items).toHaveLength(1);
		expect(plan.items[0].feature_id).toBe("messages");
		expect(plan.items[0].price).toEqual({
			amount: 1,
			interval: BillingInterval.Month,
			billing_units: 1,
			billing_method: BillingMethod.UsageBased,
			max_purchase: null,
			processors: { stripe: { price_id: "stripe_price_pr_messages" } },
		});
		expect(plan.items[0].entitlement_id).toBe("ent_messages");
		expect(plan.items[0].price_id).toBe("pr_messages");
	});

	test("the base price is never listed among the items", async () => {
		const plan = await render({
			product: planOf({
				planEntitlements: [messagesEntitlement()],
				planPrices: [prices.createFixed({ id: "pr_base" })],
			}),
		});

		expect(plan.items.map((item) => item.feature_id)).toEqual(["messages"]);
	});

	test("proration is internal and never on an item", async () => {
		const plan = await render({
			product: planOf({
				planEntitlements: [messagesEntitlement()],
				planPrices: [
					prices.createPrepaid({
						id: "pr_messages",
						featureId: "messages",
						entitlementId: "ent_messages",
					}),
				],
			}),
		});

		expect(plan.items[0].proration).toBeUndefined();
	});

	test("the feature object rides on an item only when expanded", async () => {
		const product = planOf({ planEntitlements: [messagesEntitlement()] });
		const plain = await render({ product });
		const expanded = await render({ product, expand: ["items.feature"] });

		expect(plain.items[0].feature).toBeUndefined();
		expect(expanded.items[0].feature?.id).toBe("messages");
	});
});

describe("free trial", () => {
	const trial = {
		id: "ft_1",
		internal_product_id: "internal_pro",
		length: 14,
		duration: "day",
		unique_fingerprint: false,
		card_required: true,
		is_custom: false,
		created_at: 1,
		on_end: null,
	} as unknown as NonNullable<FullProduct["free_trial"]>;

	test("a plan with no trial has none", async () => {
		const plan = await render({ product: planOf() });

		expect(plan.free_trial).toBeUndefined();
	});

	test("reads length and unit, and an unset end behaviour as null", async () => {
		const plan = await render({
			product: planOf({
				planPrices: [prices.createFixed({ id: "pr_base" })],
				overrides: { free_trial: trial },
			}),
		});

		expect(plan.free_trial).toEqual({
			duration_type: FreeTrialDuration.Day,
			duration_length: 14,
			card_required: true,
			on_end: null,
		});
	});

	test("keeps a stated end behaviour", async () => {
		const plan = await render({
			product: planOf({
				planPrices: [prices.createFixed({ id: "pr_base" })],
				overrides: {
					free_trial: { ...trial, on_end: "revert" } as typeof trial,
				},
			}),
		});

		expect(plan.free_trial?.on_end).toBe("revert");
	});
});

describe("license links", () => {
	const seat = planOf({ id: "seat", name: "Seat" });

	test("a plan with no links has no licenses key", async () => {
		const plan = await render({ product: planOf() });

		expect("licenses" in plan).toBe(false);
	});

	test("a link reads as the license plan, its version and its terms", async () => {
		const pro = planOf();
		pro.licenses = [licenseLink({ parent: pro, licenseProduct: seat })];
		const plan = await render({ product: pro });

		expect(plan.licenses).toEqual([
			{
				license_plan_id: "seat",
				version: 1,
				version_slug: "v1",
				included: 2,
				prepaid_only: true,
			},
		]);
	});

	test("metadata rides on a link only when it has some", async () => {
		const pro = planOf();
		pro.licenses = [
			licenseLink({
				parent: pro,
				licenseProduct: seat,
				overrides: { metadata: { tier: "gold" } },
			}),
		];
		const plan = await render({ product: pro });

		expect(plan.licenses?.[0].metadata).toEqual({ tier: "gold" });
	});

	test("the license plan itself is attached only when expanded", async () => {
		const pro = planOf();
		pro.licenses = [licenseLink({ parent: pro, licenseProduct: seat })];
		const plain = await render({ product: pro });
		const expanded = await render({ product: pro, expandLicensePlans: true });

		expect(plain.licenses?.[0].plan).toBeUndefined();
		expect(expanded.licenses?.[0].plan?.id).toBe("seat");
	});

	test("a customised link states how its plan differs from the license's base", async () => {
		const pricierSeat = planOf({
			id: "seat",
			name: "Seat",
			planPrices: [prices.createFixed({ id: "pr_seat_custom" })],
		});
		const pro = planOf();
		pro.licenses = [
			licenseLink({
				parent: pro,
				licenseProduct: pricierSeat,
				overrides: { customized: true, base_product: seat },
			}),
		];
		const plan = await render({ product: pro });

		expect(plan.licenses?.[0].customize?.price).toMatchObject({
			amount: 100,
			interval: "month",
		});
	});

	test("an uncustomised link carries no customize", async () => {
		const pro = planOf();
		pro.licenses = [licenseLink({ parent: pro, licenseProduct: seat })];
		const plan = await render({ product: pro });

		expect(plan.licenses?.[0].customize).toBeUndefined();
	});
});

describe("variants", () => {
	const base = planOf();
	const annual = planOf({
		id: "pro_annual",
		name: "Pro (annual)",
		planPrices: [prices.createFixed({ id: "pr_annual" })],
		overrides: { base_internal_product_id: base.internal_id },
	});

	test("a variant states its base and how it differs, given the base product", async () => {
		const plan = await render({ product: annual, baseFullProduct: base });

		expect(plan.variant_details?.base_plan_id).toBe("pro");
		expect(plan.variant_details?.customize?.price).toMatchObject({
			amount: 100,
		});
	});

	test("a variant identical to its base states the base and no difference", async () => {
		const twin = planOf({
			id: "pro_twin",
			overrides: { base_internal_product_id: base.internal_id },
		});
		const plan = await render({ product: twin, baseFullProduct: base });

		expect(plan.variant_details).toEqual({ base_plan_id: "pro" });
	});

	test("with no base product and no database, a variant states nothing about its base", async () => {
		const plan = await render({ product: annual });

		expect(plan.variant_details).toBeUndefined();
	});

	test("a base lists its variants only when expanded, each without a link back", async () => {
		const withVariants = { ...base, variants: [annual] };
		const plain = await render({ product: withVariants });
		const expanded = await render({
			product: withVariants,
			expandVariants: true,
		});

		expect("variants" in plain).toBe(false);
		expect(expanded.variants).toHaveLength(1);
		expect(expanded.variants?.[0]).toMatchObject({
			variant_plan_id: "pro_annual",
			name: "Pro (annual)",
		});
		expect(expanded.variants?.[0].customize?.price).toMatchObject({
			amount: 100,
		});
		expect("variant_details" in (expanded.variants?.[0].plan ?? {})).toBe(
			false,
		);
	});
});
