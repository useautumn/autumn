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
