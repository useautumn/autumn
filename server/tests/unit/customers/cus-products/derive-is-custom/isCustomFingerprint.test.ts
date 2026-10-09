import { describe, expect, test } from "bun:test";
import { isCustomFingerprintOf } from "@/internal/customers/cusProducts/repos/applyIsCustomByFingerprint";
import { basePrice, customerPlan, includedItem } from "./isCustomFixtures";

const planWithRowIds = ({
	entitlementIds,
	priceIds,
}: {
	entitlementIds: string[];
	priceIds: string[];
}) => {
	const plan = customerPlan({
		items: [includedItem()],
		prices: [basePrice()],
	});
	const [customerEntitlement] = plan.customer_entitlements;
	const [customerPrice] = plan.customer_prices;
	return {
		...plan,
		processor: undefined,
		customer_entitlements: entitlementIds.map((entitlement_id) => ({
			...customerEntitlement,
			entitlement_id,
		})),
		customer_prices: priceIds.map((price_id) => ({
			...customerPrice,
			price_id,
		})),
		customer_licenses: [],
	};
};

describe("isCustomFingerprintOf", () => {
	test("sorts row ids in byte order, matching the SQL fingerprint", () => {
		const fingerprint = isCustomFingerprintOf({
			customerProduct: planWithRowIds({
				entitlementIds: ["ent_b", "ent_B", "ent_a"],
				priceIds: ["pr_2", "pr_1"],
			}),
		});
		expect(fingerprint.split("|").slice(1)).toEqual([
			"ent_B,ent_a,ent_b",
			"pr_1,pr_2",
		]);
	});

	test("drops empty segments the way concat_ws skips nulls", () => {
		const fingerprint = isCustomFingerprintOf({
			customerProduct: planWithRowIds({ entitlementIds: [], priceIds: [] }),
		});
		expect(fingerprint.split("|")).toHaveLength(1);
	});
});
