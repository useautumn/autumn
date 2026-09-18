import { describe, expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import {
	buildStripeProductGroups,
	expandToFullGroups,
	groupLabel,
	isGroupSelected,
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
	});

	test("a shared product collapses to a variant count", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro", stripeId: "prod_pro" }),
				plan({ id: "Pro Yearly", stripeId: "prod_pro" }),
				plan({ id: "Pro Quarterly", stripeId: "prod_pro" }),
			],
		});
		expect(groupLabel({ group })).toBe("Pro + 2 variants");
	});

	test("a single variant is not pluralised", () => {
		const [group] = buildStripeProductGroups({
			products: [
				plan({ id: "Pro", stripeId: "prod_pro" }),
				plan({ id: "Pro Yearly", stripeId: "prod_pro" }),
			],
		});
		expect(groupLabel({ group })).toBe("Pro + 1 variant");
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
		expect(groupLabel({ group: groups[0] })).toBe("pro");
	});
});
