import { describe, expect, test } from "bun:test";
import { changesKeepCatalogKeys } from "../../../src/balanceEngine.js";
import { createCustomerProduct } from "../engineFixtures.js";

describe("changesKeepCatalogKeys", () => {
	test("increments and lock or window rows never change which catalog rows a state names", () => {
		expect(
			changesKeepCatalogKeys({
				changes: [
					{
						table: "customerEntitlements",
						op: "increment",
						id: "messages_monthly",
						add: { balance: -1 },
					},
					{ table: "locks", op: "delete", id: "lck_1" },
				],
			}),
		).toBe(true);
	});

	test("a product, price, entitlement or license row inserted or removed does", () => {
		expect(
			changesKeepCatalogKeys({
				changes: [
					{
						table: "customerProducts",
						op: "insert",
						row: createCustomerProduct(),
					},
				],
			}),
		).toBe(false);
		expect(
			changesKeepCatalogKeys({
				changes: [{ table: "customerEntitlements", op: "delete", id: "x" }],
			}),
		).toBe(false);
	});
});
