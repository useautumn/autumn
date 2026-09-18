import { expect, test } from "bun:test";
import { addDuration, StartingAfterDuration } from "@autumn/shared";
import type { ToolCall } from "../lib/context.js";
import { normalizeScheduleTiming } from "../lib/scheduleTiming.js";

const schedule = (phases: unknown[]): ToolCall => ({
	name: "createSchedule",
	args: {
		intent: "Schedule the approved terms",
		request: {
			customer_id: "customer",
			invoice_mode: { enabled: true, finalize: false },
			enable_plan_immediately: true,
			redirect_mode: "if_required",
			billing_cycle_anchor: "now",
			phases,
		},
	},
});
const plan = [
	{
		plan_id: "enterprise",
		customize: { price: { amount: 1900, interval: "month" } },
	},
];
const phasesOf = (calls: ToolCall[]) =>
	(calls[0]?.args.request as { phases: Array<Record<string, unknown>> }).phases;

test("now followed by three one-year offsets becomes consecutive numeric years", () => {
	const call = schedule([
		{ starts_at: "now", plans: plan },
		...Array.from({ length: 3 }, () => ({
			starting_after: { duration_type: "year", duration_count: 1 },
			plans: plan,
			billing_cycle_anchor: "phase_start",
		})),
	]);
	const original = structuredClone(call);
	const result = normalizeScheduleTiming({
		actions: [call],
		today: "2026-09-16T12:00:00Z",
	});
	expect(phasesOf(result).map((phase) => phase.starts_at)).toEqual(
		[2026, 2027, 2028, 2029].map((year) =>
			Date.parse(`${year}-09-16T12:00:00Z`),
		),
	);
	expect(
		phasesOf(result).every((phase) => !Object.hasOwn(phase, "starting_after")),
	).toBe(true);
	expect(phasesOf(result)[1]).toMatchObject({
		plans: plan,
		billing_cycle_anchor: "phase_start",
	});
	expect(result[0]?.args).toMatchObject({
		intent: original.args.intent,
		request: {
			invoice_mode: { enabled: true, finalize: false },
			enable_plan_immediately: true,
			redirect_mode: "if_required",
			billing_cycle_anchor: "now",
		},
	});
	expect(call).toEqual(original);
});

test.each([
	{ today: new Date(2024, 1, 29, 12), duration: StartingAfterDuration.Year },
	{ today: new Date(2024, 0, 31, 12), duration: StartingAfterDuration.Month },
])(
	"leap-year and month-end arithmetic matches the API for $duration",
	({ today, duration }) => {
		const next = addDuration({
			now: today.getTime(),
			durationType: duration,
			durationLength: 1,
		});
		const last = addDuration({
			now: next,
			durationType: duration,
			durationLength: 1,
		});
		const result = normalizeScheduleTiming({
			today,
			actions: [
				schedule([
					{ starts_at: "now", plans: plan },
					{
						starting_after: { duration_type: duration, duration_count: 1 },
						plans: plan,
					},
					{
						starting_after: { duration_type: duration, duration_count: 1 },
						plans: plan,
					},
				]),
			],
		});
		expect(phasesOf(result).map((phase) => phase.starts_at)).toEqual([
			today.getTime(),
			next,
			last,
		]);
		expect(new Date(next).getDate()).toBe(
			duration === StartingAfterDuration.Year ? 28 : 29,
		);
	},
);

test("numeric backdated timestamps are preserved and ordered with their original billing terms", () => {
	const result = normalizeScheduleTiming({
		today: "2026-09-16",
		userDateEpochsMs: [1000],
		actions: [
			schedule([
				{ starts_at: 2000, plans: [{ plan_id: "later" }] },
				{ starts_at: 1000, plans: [{ plan_id: "earlier" }] },
			]),
		],
	});
	expect(phasesOf(result)).toEqual([
		{ starts_at: 1000, plans: [{ plan_id: "earlier" }] },
		{ starts_at: 2000, plans: [{ plan_id: "later" }] },
	]);
});

test("non-schedule actions are cloned without changing fields or requiring a date", () => {
	const actions: ToolCall[] = [
		{
			name: "attach",
			args: {
				request: {
					customer_id: "customer",
					plan_id: "pro",
					billing_cycle_anchor: "now",
				},
			},
		},
	];
	const result = normalizeScheduleTiming({ actions, today: "unused" });
	expect(result).toEqual(actions);
	expect(result).not.toBe(actions);
	expect(result[0]?.args).not.toBe(actions[0]?.args);
});

test.each(
	[
		[],
		[{ plans: plan }],
		[
			{
				starting_after: { duration_type: "year", duration_count: 1 },
				plans: plan,
			},
		],
		[
			{
				starts_at: "now",
				starting_after: { duration_type: "year", duration_count: 1 },
				plans: plan,
			},
		],
		[
			{ starts_at: "now", plans: plan },
			{
				starting_after: { duration_type: "year", duration_count: 0 },
				plans: plan,
			},
		],
		[
			{ starts_at: 1000, plans: plan },
			{ starts_at: 1000, plans: plan },
		],
	].map((phases) => ({ phases })),
)(
	"rejects invalid phase timing without mutating the request: %j",
	({ phases }) => {
		const call = schedule(phases);
		const before = structuredClone(call);
		expect(() =>
			normalizeScheduleTiming({ actions: [call], today: "2026-09-16" }),
		).toThrow();
		expect(call).toEqual(before);
	},
);

test("invalid preparation dates cannot define now", () => {
	expect(() =>
		normalizeScheduleTiming({
			actions: [schedule([{ starts_at: "now", plans: plan }])],
			today: "invalid",
		}),
	).toThrow("valid preparation date");
});

test("a guessed numeric first-phase start is rejected; now-equivalent and user-supplied dates pass", () => {
	const today = "2027-04-01T00:00:00.000Z";
	const schedule = (startsAt: number) => [
		{
			name: "createSchedule",
			args: {
				request: {
					customer_id: "c",
					phases: [{ starts_at: startsAt, plans: [{ plan_id: "p" }] }],
				},
			},
		},
	];
	expect(() =>
		normalizeScheduleTiming({
			actions: schedule(Date.parse("2026-01-01T00:00:00.000Z")),
			today,
		}),
	).toThrow("neither the current date nor a date the user supplied");
	expect(() =>
		normalizeScheduleTiming({
			actions: schedule(Date.parse(today) + 60_000),
			today,
		}),
	).not.toThrow();
	const userDate = Date.parse("2026-01-01T00:00:00.000Z");
	expect(() =>
		normalizeScheduleTiming({
			actions: schedule(userDate),
			today,
			userDateEpochsMs: [userDate],
		}),
	).not.toThrow();
});

test("a phase start within a day of a user-written date snaps to that date; unrelated dates do not", () => {
	const today = "2027-04-15T00:00:00.000Z";
	const apr1 = Date.parse("2027-04-01T00:00:00.000Z");
	const jan1 = Date.parse("2028-01-01T00:00:00.000Z");
	const result = normalizeScheduleTiming({
		today,
		userDateEpochsMs: [apr1, jan1],
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: apr1, plans: [{ plan_id: "a" }] },
							{ starts_at: jan1 + 60 * 60 * 1000, plans: [{ plan_id: "b" }] },
						],
					},
				},
			},
		],
	});
	const phases = (
		result[0].args.request as { phases: Array<{ starts_at: number }> }
	).phases;
	expect(phases.map((p) => p.starts_at)).toEqual([apr1, jan1]);
	const far = normalizeScheduleTiming({
		today,
		userDateEpochsMs: [apr1],
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: apr1, plans: [{ plan_id: "a" }] },
							{
								starts_at: apr1 + 3 * 24 * 60 * 60 * 1000,
								plans: [{ plan_id: "b" }],
							},
						],
					},
				},
			},
		],
	});
	expect(
		(far[0].args.request as { phases: Array<{ starts_at: number }> }).phases[1]
			.starts_at,
	).toBe(apr1 + 3 * 24 * 60 * 60 * 1000);
});

test("a duration-resolved phase that lands within a day of a user-written date snaps to that date", () => {
	const today = "2027-04-15T00:00:00.000Z";
	const apr1 = Date.parse("2027-04-01T00:00:00.000Z");
	const jan1 = Date.parse("2028-01-01T00:00:00.000Z");
	const result = normalizeScheduleTiming({
		today,
		userDateEpochsMs: [apr1, jan1],
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: apr1, plans: [{ plan_id: "a" }] },
							{
								starting_after: { duration_type: "month", duration_count: 9 },
								plans: [{ plan_id: "b" }],
							},
						],
					},
				},
			},
		],
	});
	expect(
		(
			result[0].args.request as { phases: Array<{ starts_at: number }> }
		).phases.map((p) => p.starts_at),
	).toEqual([apr1, jan1]);
});

test("a later phase within a day of an exact year boundary from the previous phase snaps to that boundary", () => {
	const jul1 = Date.parse("2026-07-01T00:00:00.000Z");
	const result = normalizeScheduleTiming({
		today: "2026-07-01T00:00:00.000Z",
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: jul1, plans: [{ plan_id: "a" }] },
							{
								starts_at: Date.parse("2027-06-30T21:20:00.000Z"),
								plans: [{ plan_id: "b" }],
							},
						],
					},
				},
			},
		],
	});
	expect(
		(result[0].args.request as { phases: Array<{ starts_at: number }> })
			.phases[1].starts_at,
	).toBe(Date.parse("2027-07-01T00:00:00.000Z"));
	const off = normalizeScheduleTiming({
		today: "2026-07-01T00:00:00.000Z",
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: jul1, plans: [{ plan_id: "a" }] },
							{
								starts_at: Date.parse("2027-06-15T00:00:00.000Z"),
								plans: [{ plan_id: "b" }],
							},
						],
					},
				},
			},
		],
	});
	expect(
		(off[0].args.request as { phases: Array<{ starts_at: number }> }).phases[1]
			.starts_at,
	).toBe(Date.parse("2027-06-15T00:00:00.000Z"));
});

test("cumulative multi-phase drift snaps each phase to its exact yearly boundary", () => {
	const jul1 = Date.parse("2026-07-01T00:00:00.000Z");
	const result = normalizeScheduleTiming({
		today: "2026-07-01T00:00:00.000Z",
		actions: [
			{
				name: "createSchedule",
				args: {
					request: {
						customer_id: "c",
						phases: [
							{ starts_at: jul1, plans: [{ plan_id: "a" }] },
							{
								starts_at: Date.parse("2027-06-30T21:20:00.000Z"),
								plans: [{ plan_id: "b" }],
							},
							{
								starts_at: Date.parse("2028-06-29T21:20:00.000Z"),
								plans: [{ plan_id: "c" }],
							},
							{
								starts_at: Date.parse("2029-06-29T21:20:00.000Z"),
								plans: [{ plan_id: "d" }],
							},
						],
					},
				},
			},
		],
	});
	expect(
		(
			result[0].args.request as { phases: Array<{ starts_at: number }> }
		).phases.map((p) => new Date(p.starts_at).toISOString()),
	).toEqual([
		"2026-07-01T00:00:00.000Z",
		"2027-07-01T00:00:00.000Z",
		"2028-07-01T00:00:00.000Z",
		"2029-07-01T00:00:00.000Z",
	]);
});
