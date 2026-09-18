import { expect, test } from "bun:test";
import type { ToolCall } from "../lib/context.js";
import { assertNoMinorUnitConversion } from "../lib/requestedMoney.js";

const action = (request: Record<string, unknown>): ToolCall => ({
	name: "attach",
	args: { request: { customer_id: "customer", plan_id: "pro", ...request } },
});
const checkPrice = ({ message, amount }: { message: string; amount: number }) =>
	assertNoMinorUnitConversion({
		messages: [{ role: "user", content: message }],
		actions: [action({ customize: { price: { amount, interval: "month" } } })],
	});

test.each([
	{ message: "Set the price to $49 monthly", amount: 49 },
	{ message: "Charge 2k/mo", amount: 2000 },
	{ message: "Charge $36k/year", amount: 36000 },
	{ message: "Charge USD 1,234.50 each month", amount: 1234.5 },
	{ message: "Charge $2.5K per month", amount: 2500 },
	{ message: "Charge $1m annually", amount: 1000000 },
])(
	"keeps $message in major units and rejects its hundredfold conversion",
	({ message, amount }) => {
		expect(() => checkPrice({ message, amount })).not.toThrow();
		expect(() => checkPrice({ message, amount: amount * 100 })).toThrow(
			"Monetary unit error",
		);
	},
);

test("finds nested schedule prices and checks each against the user's stated amounts", () => {
	const messages = [
		{
			role: "user",
			content:
				"Year one is $40,000/year, year two $50k/year, and year three $60k/year.",
		},
	];
	const schedule = (amounts: number[]): ToolCall => ({
		name: "createSchedule",
		args: {
			request: {
				customer_id: "customer",
				phases: amounts.map((amount, index) => ({
					starts_at: 1800000000000 + index * 31536000000,
					plans: [
						{
							plan_id: "enterprise",
							customize: { price: { amount, interval: "year" } },
						},
					],
				})),
			},
		},
	});
	expect(() =>
		assertNoMinorUnitConversion({
			messages,
			actions: [schedule([40000, 50000, 60000])],
		}),
	).not.toThrow();
	expect(() =>
		assertNoMinorUnitConversion({
			messages,
			actions: [schedule([40000, 5000000, 60000])],
		}),
	).toThrow("5000000");
});

test("checks custom line items and feature tier prices as money", () => {
	const messages = [
		{
			role: "user",
			content:
				"Use $49 for the custom line item and $0.02 per additional credit.",
		},
	];
	expect(() =>
		assertNoMinorUnitConversion({
			messages,
			actions: [action({ custom_line_items: [{ amount: 4900 }] })],
		}),
	).toThrow("4900");
	expect(() =>
		assertNoMinorUnitConversion({
			messages,
			actions: [
				action({
					customize: {
						add_items: [
							{
								feature_id: "credits",
								price: { tiers: [{ to: "inf", amount: 2 }] },
							},
						],
					},
				}),
			],
		}),
	).toThrow("requested 0.02");
	expect(() =>
		assertNoMinorUnitConversion({
			messages,
			actions: [
				action({
					custom_line_items: [{ amount: 49 }],
					customize: {
						add_items: [
							{
								feature_id: "credits",
								price: { tiers: [{ to: "inf", amount: 0.02 }] },
							},
						],
					},
				}),
			],
		}),
	).not.toThrow();
});

test("credit and seat quantities are not mistaken for money", () => {
	expect(() =>
		assertNoMinorUnitConversion({
			messages: [
				{
					role: "user",
					content: "Include 2k credits and 49 seats; the base price is $49.",
				},
			],
			actions: [
				action({
					feature_quantities: [{ feature_id: "credits", quantity: 4900 }],
					customize: {
						price: { amount: 49, interval: "month" },
						add_items: [
							{ feature_id: "credits", included: 200000 },
							{ feature_id: "seats", included: 4900 },
						],
					},
				}),
			],
		}),
	).not.toThrow();
	expect(() =>
		checkPrice({ message: "Include 2k credits and 49 seats.", amount: 200000 }),
	).not.toThrow();
});

test("incorrect assistant prices cannot authorize a hundredfold user-price conversion", () => {
	const actions = [
		action({ customize: { price: { amount: 4900, interval: "month" } } }),
	];
	expect(() =>
		assertNoMinorUnitConversion({
			messages: [
				{ role: "user", content: "Charge $49 per month." },
				{
					role: "assistant",
					content: "The proposed price is $4,900 per month.",
				},
			],
			actions,
		}),
	).toThrow("requested 49");
	expect(() =>
		assertNoMinorUnitConversion({
			messages: [{ role: "assistant", content: "Charge $49 per month." }],
			actions,
		}),
	).not.toThrow();
});

test("an explicitly requested larger amount is not rejected because another user amount is a hundredth", () => {
	expect(() =>
		checkPrice({
			message:
				"The starter plan costs $49; the enterprise plan must cost $4,900.",
			amount: 4900,
		}),
	).not.toThrow();
});

test("this narrow guard does not invent financial verification for unrelated prices or zero", () => {
	expect(() =>
		checkPrice({ message: "Charge $49 monthly.", amount: 79 }),
	).not.toThrow();
	expect(() =>
		checkPrice({ message: "Charge $49 monthly.", amount: 0 }),
	).not.toThrow();
});
