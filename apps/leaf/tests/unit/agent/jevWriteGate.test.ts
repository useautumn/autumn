import { afterEach, expect, mock, test } from "bun:test";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));

const { conversationText, jevWriteGateEnabled, verifyGatedWrite } =
	await import("../../../agent/lib/jevWriteGate.js");

const originalFetch = globalThis.fetch;
const originalKey = process.env.TYPESAFE_API_KEY;
const originalGate = process.env.LEAF_JEV_GATE;
afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
	else process.env.TYPESAFE_API_KEY = originalKey;
	if (originalGate === undefined) delete process.env.LEAF_JEV_GATE;
	else process.env.LEAF_JEV_GATE = originalGate;
});

const mockVerdict = (scores: Record<string, number>) => {
	process.env.TYPESAFE_API_KEY = "test-only";
	const bodies: Array<Record<string, unknown>> = [];
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			bodies.push(body);
			return Response.json({
				answers: Object.fromEntries(
					Object.keys(body.questions).map((name) => [
						name,
						{ noul: scores[name] ?? 0 },
					]),
				),
			});
		},
		{ preconnect: originalFetch.preconnect },
	);
	return bodies;
};

const messages = [
	{ role: "system", content: "internal instructions" },
	{
		role: "user",
		content: [{ type: "text", text: "Attach Pro to Atlas at $49/month." }],
	},
	{ role: "assistant", content: "Previewing." },
];
const write = (amount: number) => ({
	request: {
		customer_id: "atlas",
		plan_id: "pro",
		customize: { price: { amount, interval: "month" } },
	},
	approval_description: "Attach Pro at the requested price.",
});

test("the gate is off unless explicitly enabled", () => {
	delete process.env.LEAF_JEV_GATE;
	expect(jevWriteGateEnabled()).toBe(false);
	process.env.LEAF_JEV_GATE = "1";
	expect(jevWriteGateEnabled()).toBe(true);
});

test("conversation text keeps only user and assistant text", () => {
	expect(conversationText(messages)).toEqual([
		{ role: "user", content: "Attach Pro to Atlas at $49/month." },
		{ role: "assistant", content: "Previewing." },
	]);
});

test("a verified write passes and the verifier sees the conversation and proposal", async () => {
	const bodies = mockVerdict({});
	const result = await verifyGatedWrite({
		args: write(49),
		messages,
		toolName: "attach",
	});
	expect(result.answers.wrong_price).toBe(0);
	expect(result.literalPriceCheck.status).toBe("checked");
	expect(bodies[0]?.state).toMatchObject({
		messages: conversationText(messages),
		proposal: { toolName: "attach", request: write(49).request },
	});
});

test("a rescaled price is refused before any verifier call", async () => {
	const bodies = mockVerdict({});
	await expect(
		verifyGatedWrite({ args: write(4900), messages, toolName: "attach" }),
	).rejects.toThrow("Monetary unit error");
	expect(bodies).toHaveLength(0);
});

test("a semantic rejection refuses the write with correction guidance", async () => {
	mockVerdict({ wrong_target: 0.8 });
	await expect(
		verifyGatedWrite({ args: write(49), messages, toolName: "attach" }),
	).rejects.toThrow("wrong_target");
});
