import { describe, expect, test } from "bun:test";
import {
	CreateScheduleParamsV0Schema,
	StartingAfterDuration,
} from "@autumn/shared";
import chalk from "chalk";

describe(chalk.yellowBright("CreateScheduleParamsV0Schema"), () => {
	test("preserves customize on parsed plan items", () => {
		const parsed = CreateScheduleParamsV0Schema.parse({
			customer_id: "cus_123",
			phases: [
				{
					starts_at: 1_000,
					plans: [
						{
							plan_id: "pro",
							customize: {
								items: [],
							},
						},
					],
				},
			],
		});

		const [phase] = parsed.phases;
		const [plan] = phase?.plans ?? [];

		expect(plan?.customize).toEqual({
			items: [],
		});
	});

	test("rejects customize.free_trial inputs", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						plans: [
							{
								plan_id: "pro",
								customize: {
									free_trial: {
										duration_length: 7,
										duration_type: "day",
										card_required: false,
									},
								},
							},
						],
					},
				],
			}),
		).toThrow();
	});

	test("rejects empty customize inputs", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						plans: [
							{
								plan_id: "pro",
								customize: {},
							},
						],
					},
				],
			}),
		).toThrow("When using customize, at least one of price");
	});

	test("rejects mixed customize items and patch items", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						plans: [
							{
								plan_id: "pro",
								customize: {
									items: [{ feature_id: "messages" }],
									add_items: [{ feature_id: "words" }],
								},
							},
						],
					},
				],
			}),
		).toThrow("customize.items (PUT-style) cannot be combined");
	});

	test("preserves subscription_id on parsed plan items", () => {
		const parsed = CreateScheduleParamsV0Schema.parse({
			customer_id: "cus_123",
			phases: [
				{
					starts_at: 1_000,
					plans: [
						{
							plan_id: "pro",
							subscription_id: "sub_123",
						},
					],
				},
			],
		});

		const [phase] = parsed.phases;
		const [plan] = phase?.plans ?? [];

		expect(plan?.subscription_id).toBe("sub_123");
	});

	test("accepts now and relative phase timing", () => {
		const parsed = CreateScheduleParamsV0Schema.parse({
			customer_id: "cus_123",
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: "base" }],
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 2,
					},
					plans: [{ plan_id: "pro" }],
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Year,
						duration_count: 1,
					},
					plans: [{ plan_id: "premium" }],
				},
			],
		});

		expect(parsed.phases[0]?.starts_at).toBe("now");
		expect(parsed.phases[1]?.starting_after).toEqual({
			duration_type: StartingAfterDuration.Month,
			duration_count: 2,
		});
		expect(parsed.phases[2]?.starting_after).toEqual({
			duration_type: StartingAfterDuration.Year,
			duration_count: 1,
		});
	});

	test("rejects empty phases", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [],
			}),
		).toThrow();
	});

	test("rejects duplicate phase starts_at values", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						plans: [{ plan_id: "base" }],
					},
					{
						starts_at: 1_000,
						plans: [{ plan_id: "pro" }],
					},
				],
			}),
		).toThrow("Phase starts_at values must be strictly increasing");
	});

	test("rejects phases with both starts_at and starting_after", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						starting_after: {
							duration_type: StartingAfterDuration.Month,
							duration_count: 1,
						},
						plans: [{ plan_id: "base" }],
					},
				],
			}),
		).toThrow("Each phase must include exactly one of starts_at or starting_after");
	});

	test("rejects phases with neither starts_at nor starting_after", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						plans: [{ plan_id: "base" }],
					},
				],
			}),
		).toThrow("Each phase must include exactly one of starts_at or starting_after");
	});

	test("rejects unsupported starting_after duration values", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: "now",
						plans: [{ plan_id: "base" }],
					},
					{
						starting_after: {
							duration_type: "week",
							duration_count: 1,
						},
						plans: [{ plan_id: "pro" }],
					},
				],
			}),
		).toThrow();
	});

	test("rejects non-positive starting_after duration counts", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: "now",
						plans: [{ plan_id: "base" }],
					},
					{
						starting_after: {
							duration_type: StartingAfterDuration.Month,
							duration_count: 0,
						},
						plans: [{ plan_id: "pro" }],
					},
				],
			}),
		).toThrow();
	});

	test("rejects starting_after on the first phase", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starting_after: {
							duration_type: StartingAfterDuration.Month,
							duration_count: 1,
						},
						plans: [{ plan_id: "base" }],
					},
				],
			}),
		).toThrow("starting_after cannot be used on the first phase");
	});

	test("rejects now after the first phase", () => {
		expect(() =>
			CreateScheduleParamsV0Schema.parse({
				customer_id: "cus_123",
				phases: [
					{
						starts_at: 1_000,
						plans: [{ plan_id: "base" }],
					},
					{
						starts_at: "now",
						plans: [{ plan_id: "pro" }],
					},
				],
			}),
		).toThrow("starts_at: 'now' can only be used on the first phase");
	});
});
