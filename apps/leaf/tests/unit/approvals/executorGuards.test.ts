import { describe, expect, test } from "bun:test";
import { previewMoneyFactsDrifted } from "../../../src/internal/approvals/utils/previewMoneyFacts.js";
import { classifyWriteExecution } from "../../../src/internal/approvals/utils/writeExecutionResult.js";

const preview = (overrides: Record<string, unknown> = {}) => ({
	currency: "usd",
	line_items: [
		{ amount: 2400, description: "Launch" },
		{ amount: 100, description: "Credits" },
	],
	total: 2500,
	...overrides,
});

describe("previewMoneyFactsDrifted", () => {
	test("identical previews do not drift", () => {
		expect(
			previewMoneyFactsDrifted({ current: preview(), stored: preview() }),
		).toEqual({ drifted: false });
	});

	test("benign field churn does not drift", () => {
		expect(
			previewMoneyFactsDrifted({
				current: preview({ generated_at: 2 }),
				stored: preview({ generated_at: 1 }),
			}),
		).toEqual({ drifted: false });
	});

	test("a total change drifts", () => {
		const result = previewMoneyFactsDrifted({
			current: preview({ total: 3100 }),
			stored: preview(),
		});
		expect(result.drifted).toBe(true);
	});

	test("a line-item amount change drifts", () => {
		const result = previewMoneyFactsDrifted({
			current: preview({
				line_items: [
					{ amount: 2400, description: "Launch" },
					{ amount: 250, description: "Credits" },
				],
			}),
			stored: preview(),
		});
		expect(result.drifted).toBe(true);
	});

	test("an unfetchable current preview drifts (fail closed)", () => {
		const result = previewMoneyFactsDrifted({
			current: { failed: true },
			stored: preview(),
		});
		expect(result.drifted).toBe(true);
	});

	test("MCP-envelope stored previews are unwrapped before comparing", () => {
		const envelope = {
			content: [{ type: "text", text: JSON.stringify(preview()) }],
		};
		expect(
			previewMoneyFactsDrifted({ current: preview(), stored: envelope }),
		).toEqual({ drifted: false });
	});
});

const CYCLE_END = 1_800_000_000_000;

const decayedAmount = ({
	amount,
	fromStart,
	toStart,
}: {
	amount: number;
	fromStart: number;
	toStart: number;
}) => (amount * (CYCLE_END - toStart)) / (CYCLE_END - fromStart);

const v2Line = ({
	amount,
	planId = "pro",
	start,
}: {
	amount: number;
	planId?: string;
	start?: number;
}) => ({
	display_name: `${planId} base`,
	feature_id: null,
	plan_id: planId,
	quantity: 1,
	subtotal: amount,
	total: amount,
	...(start !== undefined ? { period: { end: CYCLE_END, start } } : {}),
});

const v2Preview = ({
	capturedAt,
	lines,
	tax,
	total,
}: {
	capturedAt?: number;
	lines: ReturnType<typeof v2Line>[];
	tax?: number;
	total: number;
}) => ({
	...(capturedAt !== undefined ? { _captured_at: capturedAt } : {}),
	preview: {
		currency: "usd",
		line_items: lines,
		subtotal: total,
		...(tax !== undefined ? { tax: { total: tax } } : {}),
		total: total + (tax ?? 0),
	},
});

describe("previewMoneyFactsDrifted proration decay", () => {
	const t0 = CYCLE_END - 10 * 24 * 60 * 60 * 1000;
	const t1 = t0 + 3 * 60 * 1000;

	const decayedPair = ({ amount }: { amount: number }) => {
		const decayed = decayedAmount({ amount, fromStart: t0, toStart: t1 });
		return {
			current: v2Preview({
				lines: [v2Line({ amount: decayed, start: t1 })],
				total: decayed,
			}),
			decayed,
			stored: v2Preview({
				capturedAt: t0,
				lines: [v2Line({ amount, start: t0 })],
				total: amount,
			}),
		};
	};

	test("pure decay between renders does not drift", () => {
		const { current, stored } = decayedPair({ amount: 591.4 });
		expect(previewMoneyFactsDrifted({ current, stored })).toEqual({
			drifted: false,
		});
	});

	test("an off-curve amount drifts", () => {
		const { decayed, stored } = decayedPair({ amount: 591.4 });
		const current = v2Preview({
			lines: [v2Line({ amount: decayed - 0.5, start: t1 })],
			total: decayed - 0.5,
		});
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("a genuine price change on unchanged periods drifts", () => {
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: 500, start: t0 })],
			total: 500,
		});
		const current = v2Preview({
			lines: [v2Line({ amount: 620, start: t0 })],
			total: 620,
		});
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("cycle rollover drifts", () => {
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: 500, start: t0 })],
			total: 500,
		});
		const rolled = {
			...v2Line({ amount: 500, start: t1 }),
			period: { end: CYCLE_END + 1, start: t1 },
		};
		const current = v2Preview({ lines: [rolled], total: 500 });
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("a periodless line with a changed amount drifts", () => {
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: 120 })],
			total: 120,
		});
		const current = v2Preview({ lines: [v2Line({ amount: 121 })], total: 121 });
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("a decayed credit line does not drift", () => {
		const credit = -224.04;
		const decayed = decayedAmount({
			amount: credit,
			fromStart: t0,
			toStart: t1,
		});
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: credit, planId: "old", start: t0 })],
			total: credit,
		});
		const current = v2Preview({
			lines: [v2Line({ amount: decayed, planId: "old", start: t1 })],
			total: decayed,
		});
		expect(previewMoneyFactsDrifted({ current, stored })).toEqual({
			drifted: false,
		});
	});

	test("a sign flip drifts", () => {
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: -50, start: t0 })],
			total: -50,
		});
		const current = v2Preview({
			lines: [{ ...v2Line({ amount: 50, start: t1 }) }],
			total: 50,
		});
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("tax decaying with the base does not drift", () => {
		const decayed = decayedAmount({ amount: 500, fromStart: t0, toStart: t1 });
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: 500, start: t0 })],
			tax: 100,
			total: 500,
		});
		const current = v2Preview({
			lines: [v2Line({ amount: decayed, start: t1 })],
			tax: 100 * (decayed / 500),
			total: decayed,
		});
		expect(previewMoneyFactsDrifted({ current, stored })).toEqual({
			drifted: false,
		});
	});

	test("an added line drifts", () => {
		const stored = v2Preview({
			capturedAt: t0,
			lines: [v2Line({ amount: 500, start: t0 })],
			total: 500,
		});
		const current = v2Preview({
			lines: [
				v2Line({ amount: 500, start: t0 }),
				v2Line({ amount: 10, planId: "addon", start: t0 }),
			],
			total: 510,
		});
		expect(previewMoneyFactsDrifted({ current, stored }).drifted).toBe(true);
	});

	test("legacy previews without periods keep exact comparison", () => {
		const result = previewMoneyFactsDrifted({
			current: preview({
				line_items: [
					{ amount: 2400.01, description: "Launch" },
					{ amount: 100, description: "Credits" },
				],
				total: 2500.01,
			}),
			stored: preview(),
		});
		expect(result.drifted).toBe(true);
	});
});

describe("classifyWriteExecution", () => {
	test("clean results are applied", () => {
		expect(classifyWriteExecution({ result: { customer: {} } })).toMatchObject({
			status: "applied",
		});
	});

	test("error-shaped results are failed with the extracted message", () => {
		const outcome = classifyWriteExecution({
			result: {
				isError: true,
				content: [
					{
						type: "text",
						text: JSON.stringify({
							id: "TOOL_EXECUTION_FAILED",
							details: {
								errorMessage:
									'Error: Autumn API request failed (400): {"message":"Missing email.","code":"stripe_error"}',
							},
						}),
					},
				],
			},
		});
		expect(outcome.status).toBe("failed");
		expect("detail" in outcome && outcome.detail).toContain("Missing email");
	});

	test("thrown errors are unknown — never auto-retried", () => {
		const outcome = classifyWriteExecution({
			error: new Error("socket hang up"),
		});
		expect(outcome.status).toBe("unknown");
	});
});
