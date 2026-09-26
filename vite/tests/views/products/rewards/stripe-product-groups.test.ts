import { describe, expect, test } from "bun:test";
import type { Feature, ProductV2 } from "@autumn/shared";
import {
	buildStripeProductGroups,
	expandToFullGroups,
	groupLabel,
	groupSuffix,
	isGroupSelected,
	sharedProductHint,
} from "@/views/products/rewards/reward-config/components/stripeProductGroups";

const plan = ({
	id,
	stripeId,
	baseId,
	priceIds = [`${id}_price`],
}: {
	id: string;
	stripeId?: string | null;
	baseId?: string | null;
	priceIds?: string[];
}) =>
	({
		id,
		name: id,
		stripe_id: stripeId ?? null,
		base_id: baseId ?? null,
		items: priceIds.map((priceId) => ({
			price_id: priceId,
			price: 10,
		})),
	}) as unknown as ProductV2;

describe("buildStripeProductGroups", () => {
	test("plans sharing a Stripe product land in one group", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: "prod_pro" }),
				plan({ id: "pro-yearly", stripeId: "prod_pro", baseId: "pro" }),
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0].priceIds).toEqual(["pro_price", "pro-yearly_price"]);
	});

	test("plans with distinct Stripe products stay separate", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: "prod_pro" }),
				plan({ id: "team", stripeId: "prod_team" }),
			],
		});

		expect(groups).toHaveLength(2);
	});

	test("a variant not yet in Stripe groups with its base", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: null }),
				plan({ id: "pro-yearly", stripeId: null, baseId: "pro" }),
			],
		});

		expect(groups).toHaveLength(1);
	});

	test("a split variant becomes its own group", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: "prod_pro" }),
				plan({ id: "pro-yearly", stripeId: "prod_yearly", baseId: "pro" }),
			],
		});

		expect(groups).toHaveLength(2);
	});

	test("plans with no priced items are excluded", () => {
		const groups = buildStripeProductGroups({
			products: [plan({ id: "free", stripeId: "prod_free", priceIds: [] })],
		});

		expect(groups).toHaveLength(0);
	});
});

describe("groupLabel", () => {
	test("a lone plan shows its own name", () => {
		const [group] = buildStripeProductGroups({
			products: [plan({ id: "Pro", stripeId: "prod_pro" })],
		});
		expect(groupLabel({ group })).toBe("Pro");
		expect(groupSuffix({ group })).toBeNull();
	});

	test("a shared product collapses to a plan count", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro", stripeId: "prod_pro" }),
				plan({ id: "Pro Yearly", stripeId: "prod_pro", baseId: "Pro" }),
				plan({ id: "Pro Quarterly", stripeId: "prod_pro", baseId: "Pro" }),
			],
		});
		expect(groupSuffix({ group })).toBe("+ 2 variants");
	});

	test("a single sibling is not pluralised", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro", stripeId: "prod_pro" }),
				plan({ id: "Pro Yearly", stripeId: "prod_pro", baseId: "Pro" }),
			],
		});
		expect(groupSuffix({ group })).toBe("+ 1 variant");
	});
});

describe("isGroupSelected", () => {
	const [group] = buildStripeProductGroups({
		products: [
			plan({ id: "pro", stripeId: "prod_pro" }),
			plan({ id: "pro-yearly", stripeId: "prod_pro" }),
		],
	});

	test("every price selected counts as selected", () => {
		expect(
			isGroupSelected({
				group,
				priceIds: ["pro_price", "pro-yearly_price"],
			}),
		).toBe(true);
	});

	test("a partial selection does not count", () => {
		expect(isGroupSelected({ group, priceIds: ["pro_price"] })).toBe(false);
	});
});

describe("expandToFullGroups", () => {
	test("a legacy partial selection expands to the whole group", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: "prod_pro" }),
				plan({ id: "pro-yearly", stripeId: "prod_pro" }),
			],
		});

		expect(
			expandToFullGroups({ groups, priceIds: ["pro_price"] }).sort(),
		).toEqual(["pro-yearly_price", "pro_price"]);
	});

	test("an already-complete selection is unchanged", () => {
		const groups = buildStripeProductGroups({
			products: [plan({ id: "pro", stripeId: "prod_pro" })],
		});

		expect(expandToFullGroups({ groups, priceIds: ["pro_price"] })).toEqual([
			"pro_price",
		]);
	});

	test("a price from an unknown historical version is kept as-is", () => {
		const groups = buildStripeProductGroups({
			products: [plan({ id: "pro", stripeId: "prod_pro" })],
		});

		expect(expandToFullGroups({ groups, priceIds: ["orphan_price"] })).toEqual([
			"orphan_price",
		]);
	});
});

describe("duplicate product entries", () => {
	test("the same plan appearing twice does not double its price ids", () => {
		const pro = plan({ id: "pro", stripeId: "prod_pro" });
		const groups = buildStripeProductGroups({ products: [pro, pro] });

		expect(groups).toHaveLength(1);
		expect(groups[0].priceIds).toEqual(["pro_price"]);
		expect(groupSuffix({ group: groups[0] })).toBeNull();
	});
});

const usagePlan = ({
	id,
	stripeId,
	featureId,
	priceId = `${id}_usage_price`,
}: {
	id: string;
	stripeId?: string | null;
	featureId: string;
	priceId?: string;
}) =>
	({
		id,
		name: id,
		stripe_id: stripeId ?? null,
		base_id: null,
		items: [{ price_id: priceId, price: 5, feature_id: featureId }],
	}) as unknown as ProductV2;

const proWithUsage = {
	id: "pro",
	name: "pro",
	stripe_id: "prod_pro",
	base_id: null,
	items: [
		{ price_id: "pro_base", price: 20 },
		{ price_id: "pro_usage", price: 5, feature_id: "messages" },
	],
} as unknown as ProductV2;

describe("usage prices get their own feature-level group", () => {
	test("unrelated plans charging the same feature share one feature group", () => {
		const groups = buildStripeProductGroups({
			products: [
				usagePlan({ id: "pro", stripeId: "prod_pro", featureId: "messages" }),
				usagePlan({ id: "team", stripeId: "prod_team", featureId: "messages" }),
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0].kind).toBe("feature");
		expect(groups[0].priceIds.sort()).toEqual([
			"pro_usage_price",
			"team_usage_price",
		]);
	});

	test("plans charging different features stay separate", () => {
		const groups = buildStripeProductGroups({
			products: [
				usagePlan({ id: "pro", stripeId: "prod_pro", featureId: "messages" }),
				usagePlan({ id: "team", stripeId: "prod_team", featureId: "words" }),
			],
		});

		expect(groups).toHaveLength(2);
	});

	test("a shared feature does not merge plans' base prices", () => {
		const groups = buildStripeProductGroups({
			products: [
				proWithUsage,
				usagePlan({ id: "team", stripeId: "prod_team", featureId: "messages" }),
			],
		});

		expect(groups.map(({ kind, priceIds }) => ({ kind, priceIds }))).toEqual([
			{ kind: "plan", priceIds: ["pro_base"] },
			{ kind: "feature", priceIds: ["pro_usage", "team_usage_price"] },
		]);
	});

	test("a feature group is labelled with the feature name", () => {
		const groups = buildStripeProductGroups({
			products: [proWithUsage],
			features: [{ id: "messages", name: "Messages" } as Feature],
		});

		expect(groupLabel({ group: groups[1] })).toBe("Messages");
	});

	test("a feature group falls back to the feature id", () => {
		const groups = buildStripeProductGroups({ products: [proWithUsage] });

		expect(groupLabel({ group: groups[1] })).toBe("messages");
	});
});

describe("sharedProductHint", () => {
	test("lists the plans a coupon reaches, one per line", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro", stripeId: "prod_pro" }),
				plan({ id: "Pro Yearly", stripeId: "prod_pro" }),
			],
		});

		expect(sharedProductHint({ group })).toBe(
			"A coupon here applies to:\n  • Pro\n  • Pro Yearly",
		);
	});
});

describe("groupSuffix wording", () => {
	test("a variant family counts variants", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "pro", stripeId: "prod_pro" }),
				plan({ id: "pro-yearly", stripeId: "prod_pro", baseId: "pro" }),
			],
		});
		expect(groupSuffix({ group })).toBe("+ 1 variant");
	});

	test("a feature group counts the plans billing it", () => {
		const [group] = buildStripeProductGroups({
			products: [
				usagePlan({ id: "pro", stripeId: "prod_pro", featureId: "messages" }),
				usagePlan({ id: "team", stripeId: "prod_team", featureId: "messages" }),
			],
		});
		expect(groupSuffix({ group })).toBe("usage · 2 plans");
		expect(sharedProductHint({ group })).toBe(
			"Discounts messages usage on:\n  • pro\n  • team",
		);
	});
});

describe("after a split", () => {
	test("the split variant becomes its own row and the base keeps the rest", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "base", stripeId: "prod_base" }),
				plan({ id: "eu", stripeId: "prod_eu", baseId: "base" }),
				plan({ id: "apac", stripeId: "prod_base", baseId: "base" }),
			],
		});

		expect(groups).toHaveLength(2);
		const [baseGroup, euGroup] = groups;
		expect(groupLabel({ group: baseGroup })).toBe("base");
		expect(groupSuffix({ group: baseGroup })).toBe("+ 1 variant");
		expect(groupLabel({ group: euGroup })).toBe("eu");
		expect(groupSuffix({ group: euGroup })).toBeNull();
	});
});

describe("a plan with variants and a shared feature", () => {
	test("the variant family and the feature usage are separate options", () => {
		const groups = buildStripeProductGroups({
			products: [
				proWithUsage,
				plan({ id: "pro-yearly", stripeId: "prod_pro", baseId: "pro" }),
				usagePlan({ id: "team", stripeId: "prod_team", featureId: "messages" }),
			],
		});

		expect(groups).toHaveLength(2);
		const [planGroup, featureGroup] = groups;
		expect(planGroup.priceIds).toEqual(["pro_base", "pro-yearly_price"]);
		expect(groupSuffix({ group: planGroup })).toBe("+ 1 variant");
		expect(featureGroup.products.map(({ id }) => id)).toEqual(["pro", "team"]);
	});
});

describe("the base plan leads its group", () => {
	test("a variant listed before its base still reads Base + N variants", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({
					id: "Legacy Variant",
					stripeId: "prod_leg",
					baseId: "Legacy Base",
				}),
				plan({ id: "Legacy Base", stripeId: "prod_leg" }),
			],
		});

		expect(groupLabel({ group: groups[0] })).toBe("Legacy Base");
		expect(groupSuffix({ group: groups[0] })).toBe("+ 1 variant");
	});

	test("two variants listed before the base count variants", () => {
		const groups = buildStripeProductGroups({
			products: [
				plan({ id: "Pro Yearly", stripeId: "prod_pro", baseId: "Pro" }),
				plan({ id: "Pro Quarterly", stripeId: "prod_pro", baseId: "Pro" }),
				plan({ id: "Pro", stripeId: "prod_pro" }),
			],
		});

		expect(groupLabel({ group: groups[0] })).toBe("Pro");
		expect(groupSuffix({ group: groups[0] })).toBe("+ 2 variants");
	});
});

describe("sharedProductHint ordering", () => {
	test("the base is listed first even when a variant comes first", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro Yearly", stripeId: "prod_pro", baseId: "Pro" }),
				plan({ id: "Pro", stripeId: "prod_pro" }),
			],
		});

		expect(sharedProductHint({ group })).toBe(
			"A coupon here applies to:\n  • Pro\n  • Pro Yearly",
		);
	});
});
