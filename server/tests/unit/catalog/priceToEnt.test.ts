import { expect, test } from "bun:test";
import type { EntitlementWithFeature, Price } from "@autumn/shared";
import { priceToEnt } from "@autumn/shared";

const entitlement = ({
	id,
	internalProductId,
}: {
	id: string;
	internalProductId: string;
}) =>
	({
		id,
		internal_product_id: internalProductId,
		feature_id: "AI_CREDITS",
		feature: { id: "AI_CREDITS", name: "AI Credits" },
	}) as unknown as EntitlementWithFeature;

const price = ({
	entitlementId,
	internalProductId,
}: {
	entitlementId: string;
	internalProductId: string;
}) =>
	({
		id: "pr_regenerated",
		entitlement_id: entitlementId,
		internal_product_id: internalProductId,
	}) as unknown as Price;

test("priceToEnt resolves an entitlement owned by another product", () => {
	const ent = entitlement({ id: "ent_1", internalProductId: "prod_v3" });

	const resolved = priceToEnt({
		price: price({ entitlementId: "ent_1", internalProductId: "prod_v6" }),
		entitlements: [ent],
	});

	expect(resolved).toBe(ent);
});

test("priceToEnt still resolves when price and entitlement share a product", () => {
	const ent = entitlement({ id: "ent_1", internalProductId: "prod_v6" });

	const resolved = priceToEnt({
		price: price({ entitlementId: "ent_1", internalProductId: "prod_v6" }),
		entitlements: [ent],
	});

	expect(resolved).toBe(ent);
});

test("priceToEnt returns undefined when no entitlement id matches", () => {
	const resolved = priceToEnt({
		price: price({
			entitlementId: "ent_missing",
			internalProductId: "prod_v6",
		}),
		entitlements: [entitlement({ id: "ent_1", internalProductId: "prod_v6" })],
	});

	expect(resolved).toBeUndefined();
});
