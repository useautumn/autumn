/**
 * S4a contract (audit §4.3): a free-trial condition requires a trial, and its
 * duration is compared on the calendar from the trial's own start, through the
 * same date arithmetic billing uses to create the trial.
 *
 * Red (before):  `matchRuleFilter` doesn't exist; trials matched length and unit separately.
 * Green (after): every case below matches the calendar answer.
 */

import { describe, expect, test } from "bun:test";
import {
	type DurationBound,
	type DurationMatcher,
	FreeTrialDuration,
} from "@autumn/shared";
import {
	type FreeTrialFacts,
	matchRuleFilter,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { addDuration } from "@autumn/shared/utils/billingUtils/intervalUtils/addDuration.js";
import { rules } from "@tests/utils/fixtures/rules.js";
import { facts } from "./utils/facts.js";
import { matchContext } from "./utils/matchContext.js";

const months = (length: number): DurationBound => ({ length, unit: "month" });
const days = (length: number): DurationBound => ({ length, unit: "day" });

const matchTrial = ({
	duration,
	trial,
}: {
	duration: DurationMatcher;
	trial: FreeTrialFacts | null;
}) =>
	matchRuleFilter({
		rule: rules.block({
			filter: { incoming: { $some: { free_trial: { duration } } } },
		}),
		action: "billing.attach",
		facts: facts.billingChange({
			incoming: [facts.incomingPlan({ planId: "pro", freeTrial: trial })],
		}),
		context: matchContext,
	});

describe("free trial duration", () => {
	test("a trial condition requires a trial", () => {
		const attachEnterprise = ({ trial }: { trial: FreeTrialFacts | null }) =>
			matchRuleFilter({
				rule: rules.salesEnterpriseTrials(),
				action: "billing.attach",
				facts: facts.billingChange({
					incoming: [
						facts.incomingPlan({ planId: "enterprise", freeTrial: trial }),
					],
				}),
				context: matchContext,
			});

		expect(attachEnterprise({ trial: null }).matches).toBe(false);
		expect(
			attachEnterprise({ trial: facts.trial({ length: 1, unit: "month" }) })
				.matches,
		).toBe(true);
		expect(
			matchTrial({ duration: { $gte: days(1) }, trial: null }).matches,
		).toBe(false);
	});

	test("1 month equals 1 month, whatever month it starts in", () => {
		for (const startsAt of [
			Date.UTC(2028, 0, 31),
			Date.UTC(2028, 1, 1),
			Date.UTC(2028, 1, 29),
		]) {
			const trial = facts.trial({ length: 1, unit: "month", startsAt });
			expect(matchTrial({ duration: { $lte: months(1) }, trial }).matches).toBe(
				true,
			);
			expect(matchTrial({ duration: { $eq: months(1) }, trial }).matches).toBe(
				true,
			);
			expect(matchTrial({ duration: { $lt: months(1) }, trial }).matches).toBe(
				false,
			);
		}
	});

	test("31 days vs ≤ 1 month depends on the calendar", () => {
		const thirtyOneDays = ({ startsAt }: { startsAt: number }) =>
			matchTrial({
				duration: { $lte: months(1) },
				trial: facts.trial({ length: 31, unit: "day", startsAt }),
			}).matches;

		expect(thirtyOneDays({ startsAt: Date.UTC(2026, 0, 1) })).toBe(true);
		expect(thirtyOneDays({ startsAt: Date.UTC(2026, 1, 1) })).toBe(false);
	});

	test("45 days is under 2 months; 60 days from Jan 1 is not", () => {
		const underTwoMonths = ({ length }: { length: number }) =>
			matchTrial({
				duration: { $lt: months(2) },
				trial: facts.trial({ length, unit: "day" }),
			}).matches;

		expect(underTwoMonths({ length: 45 })).toBe(true);
		expect(underTwoMonths({ length: 60 })).toBe(false);
	});

	test("a 0.1-year trial agrees with billing's addDuration, so it matches < 2 months", () => {
		const startsAt = Date.UTC(2026, 0, 1);
		const trialEnd = addDuration({
			now: startsAt,
			durationType: FreeTrialDuration.Year,
			durationLength: 0.1,
		});
		const limitEnd = addDuration({
			now: startsAt,
			durationType: FreeTrialDuration.Month,
			durationLength: 2,
		});

		const { matches } = matchTrial({
			duration: { $lt: months(2) },
			trial: facts.trial({ length: 0.1, unit: "year", startsAt }),
		});

		expect(matches).toBe(trialEnd < limitEnd);
		expect(matches).toBe(true);
	});

	test("two operators must both hold", () => {
		const between = ({ length }: { length: number }) =>
			matchTrial({
				duration: { $gte: days(7), $lt: months(1) },
				trial: facts.trial({ length, unit: "day" }),
			}).matches;

		expect(between({ length: 6 })).toBe(false);
		expect(between({ length: 7 })).toBe(true);
		expect(between({ length: 31 })).toBe(false);
	});

	test("card_required and on_end match the trial's own settings", () => {
		const matchSettings = ({
			filter,
		}: {
			filter: { card_required?: boolean; on_end?: "bill" | "revert" };
		}) =>
			matchRuleFilter({
				rule: rules.block({
					filter: { incoming: { $some: { free_trial: filter } } },
				}),
				action: "billing.attach",
				facts: facts.billingChange({
					incoming: [
						facts.incomingPlan({
							planId: "pro",
							freeTrial: facts.trial({
								length: 14,
								cardRequired: true,
								onEnd: "bill",
							}),
						}),
					],
				}),
				context: matchContext,
			});

		expect(matchSettings({ filter: { card_required: true } })).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming[0].free_trial.card_required",
					label: "Trial card required",
					limit: true,
					actual: true,
				},
			],
		});
		expect(matchSettings({ filter: { card_required: false } }).matches).toBe(
			false,
		);
		expect(matchSettings({ filter: { on_end: "bill" } }).conditions).toEqual([
			{
				field: "incoming[0].free_trial.on_end",
				label: "Trial ends by",
				limit: "bill",
				actual: "bill",
			},
		]);
		expect(matchSettings({ filter: { on_end: "revert" } }).matches).toBe(false);
	});

	test("free_trial: null matches only no trial; { $ne: null } matches any trial", () => {
		const matchPresence = ({
			freeTrial,
			trial,
		}: {
			freeTrial: null | { $ne: null };
			trial: FreeTrialFacts | null;
		}) =>
			matchRuleFilter({
				rule: rules.block({
					filter: { incoming: { $some: { free_trial: freeTrial } } },
				}),
				action: "billing.attach",
				facts: facts.billingChange({
					incoming: [facts.incomingPlan({ planId: "pro", freeTrial: trial })],
				}),
				context: matchContext,
			});
		const fortyFiveDays = facts.trial({ length: 45 });

		expect(matchPresence({ freeTrial: null, trial: null })).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming[0].free_trial",
					label: "Free trial",
					limit: "none",
					actual: "none",
				},
			],
		});
		expect(
			matchPresence({ freeTrial: null, trial: fortyFiveDays }).matches,
		).toBe(false);
		expect(
			matchPresence({ freeTrial: { $ne: null }, trial: fortyFiveDays }),
		).toEqual({
			matches: true,
			conditions: [
				{
					field: "incoming[0].free_trial",
					label: "Free trial",
					limit: "any",
					actual: "45 days",
				},
			],
		});
		expect(
			matchPresence({ freeTrial: { $ne: null }, trial: null }).matches,
		).toBe(false);
	});

	test("the matched condition states the limit and the trial's own length", () => {
		expect(
			matchTrial({
				duration: { $gt: days(31) },
				trial: facts.trial({ length: 45 }),
			}).conditions,
		).toEqual([
			{
				field: "incoming[0].free_trial.duration",
				label: "Free trial length",
				limit: "> 31 days",
				actual: "45 days",
			},
		]);
		expect(
			matchTrial({
				duration: { $lt: months(2) },
				trial: facts.trial({ length: 1, unit: "month" }),
			}).conditions,
		).toEqual([
			{
				field: "incoming[0].free_trial.duration",
				label: "Free trial length",
				limit: "< 2 months",
				actual: "1 month",
			},
		]);
	});
});
