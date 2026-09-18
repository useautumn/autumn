import { expect, test } from "bun:test";
import type { ToolCall } from "../lib/context.js";
import { assertExactRequestedBasePrice } from "../lib/exactRequestedPrice.js";

const action = ({
	amount,
	interval = "month",
	name = "attach",
}: {
	amount: number;
	interval?: string;
	name?: string;
}): ToolCall => ({
	name,
	args: {
		request: {
			customer_id: "customer",
			plan_id: "marketing",
			customize: { price: { amount, interval } },
		},
	},
});
const check = ({
	content,
	amount = 1900,
	interval = "month",
}: {
	content: string;
	amount?: number;
	interval?: string;
}) =>
	assertExactRequestedBasePrice({
		messages: [{ role: "user", content }],
		actions: [action({ amount, interval })],
	});

test.each([
	"For customer ID: rsd-customer-0001, can we please upgrade their account to 700K contacts for $1900/month. This would just be for their marketing product",
	"Attach marketing_starter_150k customized to $1900/month with 700K contacts for customer rsd-customer-0001, prorated with a finalized invoice.",
])("rejects the observed tenfold base-price mutation: %s", (content) => {
	expect(check({ content })).toMatchObject({
		status: "checked",
		expected: { amount: 1900, interval: "month" },
	});
	expect(() => check({ content, amount: 19000 })).toThrow(
		"Requested base-price mismatch",
	);
	expect(() => check({ content, amount: 190000 })).toThrow(
		"Requested base-price mismatch",
	);
});

test.each([
	{
		content: "Set the base price to USD 1,234.50 each month.",
		amount: 1234.5,
		interval: "month",
	},
	{ content: "Charge $2.5K per month.", amount: 2500, interval: "month" },
	{ content: "Charge 2k/mo.", amount: 2000, interval: "month" },
	{
		content: "Set the annual base price to $36k/year.",
		amount: 36000,
		interval: "year",
	},
	{ content: "Charge $1m annually.", amount: 1000000, interval: "year" },
])(
	"compares direct literal recurring rates without rescaling: $content",
	(input) => {
		expect(check(input).status).toBe("checked");
		expect(() => check({ ...input, amount: input.amount + 1 })).toThrow(
			"Requested base-price mismatch",
		);
	},
);

test("only explicit latest user corrections supersede the requested rate", () => {
	const messages = [
		{ role: "user", content: "Charge $1900/month." },
		{ role: "assistant", content: "I propose $19,000/month." },
		{ role: "user", content: "Actually, charge $2100/month." },
		{ role: "user", content: "Looks good." },
	];
	expect(
		assertExactRequestedBasePrice({
			messages,
			actions: [action({ amount: 2100 })],
		}),
	).toMatchObject({
		status: "checked",
		expected: { amount: 2100, messageIndex: 2 },
	});
	expect(() =>
		assertExactRequestedBasePrice({
			messages,
			actions: [action({ amount: 1900 })],
		}),
	).toThrow("expected 2100/month");
});

test("assistant prices cannot supply or replace the user-requested base price", () => {
	const messages = [
		{ role: "user", content: "Charge $1900/month." },
		{ role: "assistant", content: "Charge $19,000/month." },
	];
	expect(() =>
		assertExactRequestedBasePrice({
			messages,
			actions: [action({ amount: 19000 })],
		}),
	).toThrow("expected 1900/month");
	expect(
		assertExactRequestedBasePrice({
			messages: messages.slice(1),
			actions: [action({ amount: 19000 })],
		}).status,
	).toBe("semantic_review");
});

test.each([
	"Include 1900 seats and 700K contacts.",
	"Set contacts to 1900/month.",
	'Our catalog says "charge $1900/month". Attach the negotiated plan.',
	"The old catalog price was $1900/month; attach the agreed plan.",
	"Charge twice $1900/month.",
	"Charge $1900/month minus 10%.",
	"Charge $1900/month per seat.",
	"Set the usage rate to $1900/month.",
	"Charge $1900/month then increase by 10.",
	"Charge $1900/month for the first customer and attach the standard plan to the other customer.",
	"Charge $1900/month billed annually.",
	"Explain how to set $1900/month.",
	"Do not charge $1900/month.",
	"Charge $1900/month for one plan and $3000/month for another.",
	"Charge $1.900,00/month.",
])("does not claim exact attribution for ambiguous pricing: %s", (content) => {
	expect(check({ content, amount: 19000 }).status).toBe("semantic_review");
});

test("latest formulas or target changes do not resurrect a stale literal price", () => {
	for (const content of [
		"Apply a 10% discount.",
		"Make it free.",
		"Attach a different plan for the other customer.",
		"Charge $2500/month for the second customer.",
	]) {
		expect(
			assertExactRequestedBasePrice({
				messages: [
					{
						role: "user",
						content: "Charge $1900/month for the first customer.",
					},
					{ role: "user", content },
				],
				actions: [action({ amount: 19000 })],
			}).status,
		).toBe("semantic_review");
	}
});

test("multi-action and multi-phase prices remain semantic attribution work", () => {
	const messages = [{ role: "user", content: "Charge $1900/month." }];
	expect(
		assertExactRequestedBasePrice({
			messages,
			actions: [
				action({ amount: 1900 }),
				action({ amount: 19000, name: "updateSubscription" }),
			],
		}).status,
	).toBe("semantic_review");
	const schedule: ToolCall = {
		name: "createSchedule",
		args: {
			request: {
				customer_id: "customer",
				phases: [
					{
						plans: [
							{
								plan_id: "enterprise",
								customize: { price: { amount: 1900, interval: "month" } },
							},
						],
					},
					{
						plans: [
							{
								plan_id: "enterprise",
								customize: { price: { amount: 2500, interval: "month" } },
							},
						],
					},
				],
			},
		},
	};
	expect(
		assertExactRequestedBasePrice({
			messages: [
				{
					role: "user",
					content: "Set year one to $1900/month and year two to $2500/month.",
				},
			],
			actions: [schedule],
		}).status,
	).toBe("semantic_review");
});

test("quantity and feature prices are never substituted for the base price", () => {
	const call = action({ amount: 1900 });
	Object.assign(call.args.request as object, {
		feature_quantities: [{ feature_id: "contacts", quantity: 19000 }],
	});
	expect(
		assertExactRequestedBasePrice({
			messages: [
				{ role: "user", content: "Charge $1900/month with 700K contacts." },
			],
			actions: [call],
		}).status,
	).toBe("checked");
	const featureOnly: ToolCall = {
		name: "updateSubscription",
		args: {
			request: {
				customize: {
					add_items: [
						{
							feature_id: "credits",
							price: { amount: 19000, interval: "month" },
						},
					],
				},
			},
		},
	};
	expect(
		assertExactRequestedBasePrice({
			messages: [{ role: "user", content: "Charge $1900/month." }],
			actions: [featureOnly],
		}).status,
	).toBe("semantic_review");
});

test("an explicit interval cannot silently become a different billing period", () => {
	expect(() =>
		check({ content: "Charge $1900/month.", interval: "year" }),
	).toThrow("Requested base-price mismatch");
	const call = action({ amount: 1900 });
	const request = call.args.request as {
		customize: { price: { interval_count?: number } };
	};
	request.customize.price.interval_count = 12;
	expect(() =>
		assertExactRequestedBasePrice({
			messages: [{ role: "user", content: "Charge $1900/month." }],
			actions: [call],
		}),
	).toThrow("Requested base-price mismatch");
});
