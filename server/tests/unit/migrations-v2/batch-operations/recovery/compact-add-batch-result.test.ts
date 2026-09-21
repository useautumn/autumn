import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { z } from "zod/v4";
import type { AddBatchResultSchema } from "@/internal/migrations/v2/batchOperations/actions/addCustomerEntitlementsForPage/types/addBatchResult.js";
import { addBatchResultToCompact } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/addBatchResultToCompact.js";
import { compactToAddBatchResult } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/compactToAddBatchResult.js";

type AddBatchResult = z.infer<typeof AddBatchResultSchema>;

const insertedItem: AddBatchResult["insertedItems"][number] = {
	internalCustomerId: "customer_1",
	customerProductId: "customer_product_1",
	entityId: null,
	planId: "pro",
	featureId: "messages",
	granted: 100,
	unlimited: false,
	nextResetAt: 1_800_000_000_000,
	status: CusProductStatus.Active,
	startsAt: 1_790_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
};

describe("compact add batch results", () => {
	test("preserves every original row fact through JSON storage", () => {
		const result: AddBatchResult = {
			candidates: [
				{ customerProductId: "customer_product_1" },
				{ customerProductId: "customer_product_2" },
				{ customerProductId: "customer_product_3" },
				{ customerProductId: "customer_product_excluded" },
			],
			excludedInternalCustomerIds: ["customer_excluded"],
			insertedItems: [
				insertedItem,
				{
					...insertedItem,
					internalCustomerId: "customer_2",
					customerProductId: "customer_product_2",
					entityId: "entity_2",
					planId: "business",
					featureId: "seats",
					granted: null,
					remaining: null,
					unlimited: true,
					nextResetAt: null,
					status: CusProductStatus.Expired,
					startsAt: null,
					canceledAt: 1_791_000_000_000,
					endedAt: 1_792_000_000_000,
					trialEndsAt: 1_790_500_000_000,
				},
				{
					...insertedItem,
					internalCustomerId: "customer_3",
					customerProductId: "customer_product_3",
					granted: 0,
					remaining: 0,
					startsAt: 0,
				},
			],
		};
		const original = structuredClone(result);
		const compact = addBatchResultToCompact({ result });
		const restored = compactToAddBatchResult({
			result: JSON.parse(JSON.stringify(compact)),
		});

		expect(restored).toStrictEqual(original);
		expect(result).toStrictEqual(original);
		expect(compact.rows[0]).toStrictEqual({
			internalCustomerId: "customer_1",
			customerProductId: "customer_product_1",
		});
		expect(restored.insertedItems[0]).not.toHaveProperty("remaining");
		expect(restored.insertedItems[1].remaining).toBeNull();
		expect(restored.insertedItems[2].remaining).toBe(0);
	});

	test("retains empty insert outcomes", () => {
		const result: AddBatchResult = {
			candidates: [{ customerProductId: "customer_product_excluded" }],
			excludedInternalCustomerIds: ["customer_excluded"],
			insertedItems: [],
		};
		const compact = addBatchResultToCompact({ result });
		expect(compact.defaults).toBeNull();
		expect(compactToAddBatchResult({ result: compact })).toStrictEqual(result);
	});

	test("stores 5,000 homogeneous rows with fewer bytes and restores them exactly", () => {
		const insertedItems = Array.from({ length: 5_000 }, (_, index) => ({
			...insertedItem,
			internalCustomerId: `customer_${index}`,
			customerProductId: `customer_product_${index}`,
		}));
		const result: AddBatchResult = {
			candidates: insertedItems.map(({ customerProductId }) => ({
				customerProductId,
			})),
			excludedInternalCustomerIds: [],
			insertedItems,
		};
		const stored = JSON.stringify(addBatchResultToCompact({ result }));
		expect(Buffer.byteLength(stored)).toBeLessThan(
			Buffer.byteLength(JSON.stringify(result)) / 2,
		);
		expect(
			compactToAddBatchResult({ result: JSON.parse(stored) }),
		).toStrictEqual(result);
	});
});
