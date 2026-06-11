import { describe, expect, test } from "bun:test";
import { CreateScheduleParamsV0Schema } from "@autumn/shared";
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
});
