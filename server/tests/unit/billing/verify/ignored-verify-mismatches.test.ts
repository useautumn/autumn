/**
 * One org runs Stripe schedules whose only future change is a quantity step;
 * the subscription webhook applies it, so Autumn holds no phase for it and
 * verify's unexpected_schedule is noise.
 *
 * The exception must be narrow: a schedule that changes a price or a plan is
 * real drift and still has to report, for that org as much as any other.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { isQuantityOnlySchedule } from "@/internal/billing/v2/actions/verify/evaluate/isQuantityOnlySchedule.js";
import {
	IGNORED_VERIFY_RULES,
	orgIgnoresVerifyRule,
} from "@/internal/billing/v2/actions/verify/ignoredVerifyMismatches.js";

const CONFIGURED_ORG_ID = "J5DBNq2fVFPh3Od7QhKltZuRwihXHOCy";

const scheduleWith = ({
	currentPrices,
	futurePrices,
}: {
	currentPrices: string[];
	futurePrices?: string[];
}) =>
	({
		current_phase: { start_date: 100 },
		phases: [
			{ start_date: 100, items: currentPrices.map((price) => ({ price })) },
			...(futurePrices
				? [{ start_date: 200, items: futurePrices.map((price) => ({ price })) }]
				: []),
		],
	}) as unknown as Stripe.SubscriptionSchedule;

describe("isQuantityOnlySchedule", () => {
	it("is quantity-only when the future phase keeps the same prices", () => {
		expect(
			isQuantityOnlySchedule({
				schedule: scheduleWith({
					currentPrices: ["price_a"],
					futurePrices: ["price_a"],
				}),
			}),
		).toBe(true);
	});

	it("is not quantity-only when a future phase changes price", () => {
		expect(
			isQuantityOnlySchedule({
				schedule: scheduleWith({
					currentPrices: ["price_a"],
					futurePrices: ["price_b"],
				}),
			}),
		).toBe(false);
	});

	it("is not quantity-only when a future phase adds an item", () => {
		expect(
			isQuantityOnlySchedule({
				schedule: scheduleWith({
					currentPrices: ["price_a"],
					futurePrices: ["price_a", "price_b"],
				}),
			}),
		).toBe(false);
	});

	it("is not quantity-only when a future phase drops an item", () => {
		expect(
			isQuantityOnlySchedule({
				schedule: scheduleWith({
					currentPrices: ["price_a", "price_b"],
					futurePrices: ["price_a"],
				}),
			}),
		).toBe(false);
	});

	it("is not quantity-only with no future phase at all", () => {
		expect(
			isQuantityOnlySchedule({
				schedule: scheduleWith({ currentPrices: ["price_a"] }),
			}),
		).toBe(false);
	});
});

describe("the rule's blast radius", () => {
	const cancelState = readFileSync(
		join(
			import.meta.dir,
			"../../../../src/internal/billing/v2/actions/verify/evaluate/evaluateCancelState.ts",
		),
		"utf8",
	);

	it("only ever suppresses unexpected_schedule", () => {
		const suppressed = cancelState
			.split("\n")
			.filter((line) => line.includes("quantityOnly && ignoresQuantityOnly"));

		expect(suppressed).toHaveLength(2);
		for (const line of suppressed) {
			const block = cancelState.slice(cancelState.indexOf(line));
			expect(block.slice(0, 400)).toContain('reason: "unexpected_schedule"');
		}
	});

	it("leaves missing_schedule to a file the rule does not touch", () => {
		expect(cancelState).not.toContain("missing_schedule");
	});
});

describe("orgIgnoresVerifyRule", () => {
	it("applies to the configured org", () => {
		expect(
			orgIgnoresVerifyRule({
				orgId: CONFIGURED_ORG_ID,
				rule: IGNORED_VERIFY_RULES.quantityOnlySchedule,
			}),
		).toBe(true);
	});

	it("does not apply to any other org", () => {
		expect(
			orgIgnoresVerifyRule({
				orgId: "org_without_overrides",
				rule: IGNORED_VERIFY_RULES.quantityOnlySchedule,
			}),
		).toBe(false);
	});
});
