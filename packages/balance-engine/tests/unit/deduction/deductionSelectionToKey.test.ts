import { describe, expect, test } from "bun:test";
import { deductionSelectionToKey } from "../../../src/balanceEngine.js";
import { org } from "../engineFixtures.js";
import { createDeductionRequest } from "./deductionFixtures.js";

const selectionOf = (
	overrides: Partial<Parameters<typeof createDeductionRequest>[0]> = {},
) => createDeductionRequest({ org, value: 1, ...overrides }).selection;

describe("deduction selection key", () => {
	test("names everything that picks the rows except the clock", () => {
		expect(
			deductionSelectionToKey({ selection: selectionOf({ now: 1 }) }),
		).toBe(deductionSelectionToKey({ selection: selectionOf({ now: 2 }) }));
		const base = deductionSelectionToKey({ selection: selectionOf() });
		for (const other of [
			selectionOf({ featureId: "credits" }),
			selectionOf({ includesCreditSystems: false }),
			selectionOf({ countsUsageWindows: false }),
			selectionOf({ countsAllocations: false }),
			selectionOf({
				enforceOverdueBlock: true,
				org: { config: { ...org.config, block_overdue_entitlements: true } },
			}),
			selectionOf({
				org: { config: { ...org.config, reverse_deduction_order: true } },
			}),
			selectionOf({
				org: {
					config: {
						...org.config,
						include_past_due: !org.config.include_past_due,
					},
				},
			}),
			selectionOf({ customerEntitlementFilters: { balanceId: "bal_1" } }),
		])
			expect(deductionSelectionToKey({ selection: other })).not.toBe(base);
	});

	test("event properties leave the key alone: a context they shaped says so itself", () => {
		expect(
			deductionSelectionToKey({
				selection: selectionOf({ properties: { model: "large" } }),
			}),
		).toBe(deductionSelectionToKey({ selection: selectionOf() }));
	});
});
