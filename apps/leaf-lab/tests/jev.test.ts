import { afterEach, expect, test } from "bun:test";
import { unpreviewedWriteReason } from "../../leaf/src/internal/approvals/utils/previewedRequest.js";
import {
	prepareContext,
	unpackToolResult,
	verifyProposal,
} from "../lib/context.js";
import { askJev } from "../lib/jev.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.TYPESAFE_API_KEY;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
	else process.env.TYPESAFE_API_KEY = originalKey;
});

test("Jev refuses missing credentials without making a request", async () => {
	delete process.env.TYPESAFE_API_KEY;
	await expect(
		askJev({
			state: {},
			questions: { missing: "Is a field missing?" },
			onMeasurement: () => {},
		}),
	).rejects.toThrow("TYPESAFE_API_KEY");
});

test("Jev requires an answer for every requested check", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	globalThis.fetch = Object.assign(async () => Response.json({ answers: {} }), {
		preconnect: originalFetch.preconnect,
	});
	await expect(
		askJev({
			state: {},
			questions: { missing: "Is a field missing?" },
			onMeasurement: () => {},
		}),
	).rejects.toThrow("omitted");
});

test("Jev preserves independent probabilities and records usage", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	globalThis.fetch = Object.assign(
		async () =>
			Response.json({
				answers: { price: { noul: 0.95 }, target: { noul: 0.01 } },
				usage: { input_tokens: 100, output_tokens: 5 },
			}),
		{ preconnect: originalFetch.preconnect },
	);
	const measurements: unknown[] = [];
	const answers = await askJev({
		state: {},
		questions: { price: "Wrong price?", target: "Wrong target?" },
		onMeasurement: (value) => measurements.push(value),
	});
	expect(answers).toEqual({ price: 0.95, target: 0.01 });
	expect(measurements[0]).toMatchObject({ inputTokens: 100, outputTokens: 5 });
});

test("tool errors never become trusted context", () => {
	expect(() => unpackToolResult({ isError: true })).toThrow();
	expect(() =>
		unpackToolResult({
			content: [{ type: "text", text: '{"error":"missing customer"}' }],
		}),
	).toThrow();
});

test("the reused Leaf guard rejects writes without the exact preview", () => {
	const request = {
		customer_id: "fixture",
		plan_id: "pro",
		customize: { price: { amount: 49, interval: "month" } },
	};
	const input = {
		previewTool: "previewAttach",
		toolName: "attach",
		previewed: [{ previewTool: "previewAttach", request }],
	};
	expect(unpreviewedWriteReason({ ...input, request })).toBeUndefined();
	expect(
		unpreviewedWriteReason({
			...input,
			request: { customer_id: "fixture", plan_id: "pro" },
		}),
	).toContain("customize");
	expect(
		unpreviewedWriteReason({ ...input, previewed: [], request }),
	).toContain("never run");
});

test("context selection receives the original request and executes real reads", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	const messages = [{ role: "user", content: "Attach Pro to Atlas Labs" }];
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.state.messages).toEqual(messages);
			return Response.json({
				answers: Object.fromEntries(
					Object.keys(body.questions).map((key) => [
						key,
						{ noul: key.startsWith("customer_") ? 0.99 : 0.1 },
					]),
				),
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
	const calls: string[] = [];
	await prepareContext({
		messages,
		mode: "jev",
		onMeasurement: () => {},
		call: async ({ name, args }) => {
			calls.push(name);
			expect(typeof args.intent).toBe("string");
			const result =
				name === "listCustomers"
					? { list: [{ id: "atlas", name: "Atlas Labs" }] }
					: {};
			return { content: [{ type: "text", text: JSON.stringify(result) }] };
		},
	});
	expect(calls).toEqual([
		"getAgentRules",
		"listPlans",
		"listFeatures",
		"listCustomers",
		"getCustomer",
		"listEntities",
	]);
});

test("one verifier flag blocks a proposal even when other checks pass", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	globalThis.fetch = Object.assign(
		async () =>
			Response.json({
				answers: {
					wrong_target: { noul: 0.01 },
					wrong_price: { noul: 0.95 },
					missing_terms: { noul: 0.01 },
					violates_rules: { noul: 0.01 },
				},
			}),
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		verifyProposal({
			evidence: {},
			call: { name: "attach", args: {} },
			onMeasurement: () => {},
			onVerdict: () => {},
		}),
	).rejects.toThrow("wrong_price");
});

test("empty organization notes do not create a semantic policy check", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.questions).not.toHaveProperty("violates_rules");
			return Response.json({
				answers: Object.fromEntries(
					Object.keys(body.questions).map((key) => [key, { noul: 0.01 }]),
				),
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
	await verifyProposal({
		evidence: {
			facts: {
				getAgentRules: {
					notes: "",
					entity_rules: { attach_to_entities: false },
				},
			},
		},
		call: { name: "attach", args: { request: { customer_id: "atlas" } } },
		onMeasurement: () => {},
		onVerdict: () => {},
	});
});

test("entity-required organization rule rejects missing entity deterministically", async () => {
	delete process.env.TYPESAFE_API_KEY;
	await expect(
		verifyProposal({
			evidence: {
				facts: {
					getAgentRules: { entity_rules: { attach_to_entities: true } },
				},
			},
			call: { name: "attach", args: { request: { customer_id: "atlas" } } },
			onMeasurement: () => {},
			onVerdict: () => {},
		}),
	).rejects.toThrow("resolve entity_id");
});

test("one overload response is retried once and the retry's answer is used; a second overload fails", async () => {
	process.env.TYPESAFE_API_KEY = "test-only";
	let calls = 0;
	globalThis.fetch = Object.assign(
		async () => {
			calls++;
			return calls === 1
				? new Response("overloaded", { status: 529 })
				: Response.json({ answers: { q: { noul: 0.2 } } });
		},
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		askJev({ state: {}, questions: { q: "?" }, onMeasurement: () => {} }),
	).resolves.toEqual({ q: 0.2 });
	expect(calls).toBe(2);
	calls = 0;
	globalThis.fetch = Object.assign(
		async () => {
			calls++;
			return new Response("overloaded", { status: 529 });
		},
		{ preconnect: originalFetch.preconnect },
	);
	await expect(
		askJev({ state: {}, questions: { q: "?" }, onMeasurement: () => {} }),
	).rejects.toThrow("HTTP 529");
	expect(calls).toBe(2);
});
