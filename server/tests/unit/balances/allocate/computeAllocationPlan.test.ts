import { describe, expect, test } from "bun:test";
import { MAX_ALLOCATED_ENTITIES } from "@autumn/shared";
import { computeAllocationPlan } from "@/internal/balances/allocate/compute/computeAllocationPlan.js";

const amountsFor = ({ count }: { count: number }) =>
	Object.fromEntries(
		Array.from({ length: count }, (_, index) => [`ent_${index}`, 1]),
	);

const plan = ({
	currentAmounts,
	entries,
}: {
	currentAmounts: Record<string, number>;
	entries: { internalEntityId: string; amount: number }[];
}) =>
	computeAllocationPlan({
		featureId: "messages",
		isFirstCall: Object.keys(currentAmounts).length === 0,
		sharedGranted: 1_000_000,
		sharedRemaining: 1_000_000,
		currentAmounts,
		currentUsage: {},
		entries,
	});

describe("computeAllocationPlan entity cap", () => {
	test("filling the allocation up to the cap is allowed", () => {
		const result = plan({
			currentAmounts: amountsFor({ count: MAX_ALLOCATED_ENTITIES - 1 }),
			entries: [{ internalEntityId: "ent_new", amount: 1 }],
		});
		expect(Object.keys(result.amounts)).toHaveLength(MAX_ALLOCATED_ENTITIES);
	});

	test("adding an entity past the cap is rejected", () => {
		expect(() =>
			plan({
				currentAmounts: amountsFor({ count: MAX_ALLOCATED_ENTITIES }),
				entries: [{ internalEntityId: "ent_new", amount: 1 }],
			}),
		).toThrow(expect.objectContaining({ code: "too_many_allocated_entities" }));
	});

	test("released entities don't count toward the cap", () => {
		const result = plan({
			currentAmounts: amountsFor({ count: MAX_ALLOCATED_ENTITIES }),
			entries: [
				{ internalEntityId: "ent_0", amount: 0 },
				{ internalEntityId: "ent_new", amount: 1 },
			],
		});
		expect(Object.keys(result.amounts)).toHaveLength(MAX_ALLOCATED_ENTITIES);
		expect(result.amounts.ent_0).toBeUndefined();
	});

	test("changing or releasing existing shares still works over the cap", () => {
		const result = plan({
			currentAmounts: amountsFor({ count: MAX_ALLOCATED_ENTITIES + 5 }),
			entries: [
				{ internalEntityId: "ent_0", amount: 2 },
				{ internalEntityId: "ent_1", amount: 0 },
			],
		});
		expect(Object.keys(result.amounts)).toHaveLength(
			MAX_ALLOCATED_ENTITIES + 4,
		);
		expect(result.amounts.ent_0).toBe(2);
	});
});
