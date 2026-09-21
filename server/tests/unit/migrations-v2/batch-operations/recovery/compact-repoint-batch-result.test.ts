import { describe, expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { z } from "zod/v4";
import { compactToRepointBatchResult } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/compactToRepointBatchResult.js";
import { repointBatchResultToCompact } from "@/internal/migrations/v2/batchOperations/execute/recovery/compactResults/repointBatchResultToCompact.js";
import type { RepointBatchResultSchema } from "@/internal/migrations/v2/batchOperations/execute/types/repointBatchResult.js";

type RepointBatchResult = z.infer<typeof RepointBatchResultSchema>;
const repointedRow: RepointBatchResult["rows"][number] = {
	internalCustomerId: "customer_1",
	customerProductId: "customer_product_1",
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: 1_790_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
};

describe("compact repoint batch results", () => {
	test("preserves original identities and lifecycle differences through JSON storage", () => {
		const result: RepointBatchResult = {
			rows: [
				repointedRow,
				{
					internalCustomerId: "customer_2",
					customerProductId: "customer_product_2",
					entityId: "entity_2",
					status: CusProductStatus.Expired,
					startsAt: null,
					canceledAt: 1_791_000_000_000,
					endedAt: 1_792_000_000_000,
					trialEndsAt: 0,
				},
			],
		};
		const original = structuredClone(result);
		const compact = repointBatchResultToCompact({ result });
		expect(
			compactToRepointBatchResult({
				result: JSON.parse(JSON.stringify(compact)),
			}),
		).toStrictEqual(original);
		expect(result).toStrictEqual(original);
		expect(compact.rows[0]).toStrictEqual({
			internalCustomerId: "customer_1",
			customerProductId: "customer_product_1",
		});
	});

	test("restores an empty result", () => {
		const compact = repointBatchResultToCompact({ result: { rows: [] } });
		expect(compact.defaults).toBeNull();
		expect(compactToRepointBatchResult({ result: compact })).toStrictEqual({
			rows: [],
		});
	});

	test("stores 5,000 homogeneous rows with fewer bytes", () => {
		const result: RepointBatchResult = {
			rows: Array.from({ length: 5_000 }, (_, index) => ({
				...repointedRow,
				internalCustomerId: `customer_${index}`,
				customerProductId: `customer_product_${index}`,
			})),
		};
		const stored = JSON.stringify(repointBatchResultToCompact({ result }));
		expect(Buffer.byteLength(stored)).toBeLessThan(
			Buffer.byteLength(JSON.stringify(result)),
		);
		expect(
			compactToRepointBatchResult({ result: JSON.parse(stored) }),
		).toStrictEqual(result);
	});
});
