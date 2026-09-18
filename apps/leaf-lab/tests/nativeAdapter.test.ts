import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { startNativeBridge } from "../native/lib/bridge.js";
import { nativeApprovalPolicy } from "../native/lib/policy.js";
import { createNativeSeed } from "../native/lib/seed.js";

let bridge: Awaited<ReturnType<typeof startNativeBridge>>;
let reportDir: string;
const sessionId = "native-static-test";
const request = {
	customer_id: "gen-attach-multi",
	plan_id: "pro_gen-attach-multi",
	customize: { price: { amount: 1035, interval: "month" } },
};
const write = {
	sessionId,
	callId: "write-1",
	name: "attach",
	args: {
		request,
		approval_description: "Custom base price $1,035 per month.",
	},
};

const post = async (path: string, body: unknown) => {
	const response = await fetch(new URL(path, bridge.url), {
		method: "POST",
		headers: {
			authorization: `Bearer ${bridge.token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const value = await response.json();
	return { status: response.status, value };
};

const resultText = (value: unknown) => {
	const text = (value as { content: Array<{ text: string }> }).content[0]?.text;
	if (!text) throw new Error("Expected an MCP text result");
	return JSON.parse(text);
};

beforeAll(async () => {
	await mkdir(resolve(homedir(), ".capy/work/leaf-lab-full/native"), {
		recursive: true,
	});
	reportDir = await mkdtemp(
		resolve(homedir(), ".capy/work/leaf-lab-full/native/static-"),
	);
	bridge = await startNativeBridge({ mode: "flash", reportDir });
});
afterAll(async () => {
	await bridge?.close();
});

test("native seed uses source-backed major-unit prices and fresh customers", () => {
	const seed = createNativeSeed();
	expect(seed.refs.plans.pro.price?.amount).toBe(20);
	expect(seed.refs.plans.growth.price?.amount).toBe(300);
	expect(seed.refs.plans.scale.price?.amount).toBe(500);
	expect(seed.refs.plans.scaleYearly.price?.amount).toBe(5000);
	const customer = seed.customers[0];
	if (!customer) throw new Error("Native seed needs customers");
	customer.email = "changed@example.test";
	expect(createNativeSeed().customers[0]?.email).not.toBe(
		"changed@example.test",
	);
});

test("native bridge requires authentication and never forwards unknown tools", async () => {
	expect(
		(await fetch(new URL("/tools", bridge.url), { method: "POST", body: "{}" }))
			.status,
	).toBe(401);
	expect(
		(await post("/call", { ...write, name: "deleteEverything" })).status,
	).toBe(422);
});

test("context routing performs no Autumn reads in the non-Jev arm", async () => {
	const response = await post("/context", {
		sessionId: "context-only",
		messages: [
			{ role: "user", content: "Pro is $20/month. What does Pro cost?" },
		],
	});
	expect(response.status).toBe(200);
	expect((response.value as { content: string }).content).toContain(
		"answer without tools",
	);
	expect(
		(response.value as { tools: Array<{ name: string }> }).tools.some(
			(tool) => tool.name === "createReward",
		),
	).toBe(true);
	const events = (await readFile(resolve(reportDir, "bridge.jsonl"), "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	expect(
		events.some(
			(event) =>
				event.type === "tool_result" && event.call.sessionId === "context-only",
		),
	).toBe(false);
});

test("unknown customer remains an observable completed read, never a proposed write", async () => {
	const lookup = await post("/call", {
		sessionId,
		callId: "ghost-read",
		name: "getCustomer",
		args: { request: { customer_id: "helloworld" } },
	});
	expect(lookup.status).toBe(200);
	expect(resultText(lookup.value)).toMatchObject({
		error: "customer not found",
	});
	const proposal = await post("/validate", {
		sessionId,
		callId: "ghost-write",
		name: "updateCustomer",
		args: {
			request: { customer_id: "helloworld", name: "Anakin" },
			approval_description: "Rename customer",
		},
	});
	expect(proposal.status).toBe(422);
});

test("approval validation requires an exact preview and observed customer", async () => {
	expect((await post("/validate", write)).status).toBe(422);
	const customer = await post("/call", {
		sessionId,
		callId: "customer-read",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	expect(customer.status).toBe(200);
	const preview = await post("/call", {
		sessionId,
		callId: "preview-1",
		name: "previewAttach",
		args: { request },
	});
	expect(preview.status).toBe(200);
	expect(resultText(preview.value)).toMatchObject({ total: 1035 });
	expect((await post("/validate", write)).status).toBe(200);
	expect((await post("/call", write)).status).toBe(422);
});

test("authorized mock execution is idempotent and cannot drift from its proposal", async () => {
	expect(
		(
			await post("/authorize", {
				...write,
				args: { ...write.args, request: { ...request, plan_id: "scale" } },
			})
		).status,
	).toBe(422);
	expect((await post("/authorize", write)).status).toBe(200);
	const first = await post("/call", write);
	const replay = await post("/call", write);
	expect(first.status).toBe(200);
	expect(replay.value).toEqual(first.value);
	const customer = await post("/call", {
		sessionId,
		callId: "customer-after",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	expect(resultText(customer.value).subscriptions).toHaveLength(1);
});

test("new session state is isolated from approved mock writes", async () => {
	const customer = await post("/call", {
		sessionId: "another-session",
		callId: "customer-read",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	expect(resultText(customer.value).subscriptions).toHaveLength(0);
});

test("refined proposals make the previous immutable request unapprovable", async () => {
	const refinementSession = "refinement-session";
	await post("/call", {
		sessionId: refinementSession,
		callId: "lookup",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	await post("/call", {
		sessionId: refinementSession,
		callId: "preview-original",
		name: "previewAttach",
		args: { request },
	});
	const original = { ...write, sessionId: refinementSession };
	expect((await post("/validate", original)).status).toBe(200);
	const changed = {
		...request,
		customize: { price: { amount: 1200, interval: "month" } },
	};
	await post("/call", {
		sessionId: refinementSession,
		callId: "preview-replacement",
		name: "previewAttach",
		args: { request: changed },
	});
	const replacement = {
		...original,
		callId: "replacement",
		args: {
			request: changed,
			approval_description: "Updated custom base price to $1,200/month.",
		},
	};
	expect((await post("/validate", replacement)).status).toBe(200);
	expect((await post("/authorize", original)).status).toBe(422);
	expect((await post("/authorize", replacement)).status).toBe(200);
});

test("multiple immutable proposals can be pending together without execution", async () => {
	const batchSession = "batch-session";
	await post("/call", {
		sessionId: batchSession,
		callId: "lookup",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	await post("/call", {
		sessionId: batchSession,
		callId: "preview",
		name: "previewAttach",
		args: { request },
	});
	const summary =
		"Update email to billing@new.example and attach Pro at custom $1,035/month.";
	const email = {
		sessionId: batchSession,
		callId: "email",
		name: "updateCustomer",
		args: {
			request: {
				customer_id: request.customer_id,
				email: "billing@new.example",
			},
			approval_description: summary,
		},
	};
	const attach = {
		...write,
		sessionId: batchSession,
		args: { ...write.args, approval_description: summary },
	};
	expect((await post("/validate", email)).status).toBe(200);
	expect((await post("/validate", attach)).status).toBe(200);
	expect((await post("/call", email)).status).toBe(422);
	expect((await post("/call", attach)).status).toBe(422);
	const customer = await post("/call", {
		sessionId: batchSession,
		callId: "state",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	expect(resultText(customer.value).subscriptions).toHaveLength(0);
	expect(resultText(customer.value).email).not.toBe("billing@new.example");
});

test("SDK cancellation tracking retires only the selected genuine pending proposal", async () => {
	const id = "sdk-cancellation-session";
	await post("/call", {
		sessionId: id,
		callId: "lookup",
		name: "getCustomer",
		args: { request: { customer_id: request.customer_id } },
	});
	await post("/call", {
		sessionId: id,
		callId: "preview",
		name: "previewAttach",
		args: { request },
	});
	const proposal = { ...write, sessionId: id };
	expect((await post("/validate", proposal)).status).toBe(200);
	expect(
		(await post("/validate", { ...proposal, callId: "duplicate" })).status,
	).toBe(422);
	expect(
		(
			await post("/supersede", {
				sessionId: id,
				call_id: "invented",
				reason: "User refined terms",
			})
		).status,
	).toBe(422);
	await post("/pending", {
		sessionId: id,
		requests: [
			{
				requestId: "sdk-request-1",
				kind: "tool-approval",
				action: { callId: proposal.callId, input: proposal.args },
			},
		],
	});
	const tools = await post("/tools", {
		sessionId: id,
		messages: [{ role: "user", content: "Explain without changes" }],
	});
	expect(JSON.stringify(tools.value)).toContain(proposal.callId);
	const cancellation = await post("/supersede", {
		sessionId: id,
		call_id: proposal.callId,
		reason: "User requested a trial",
	});
	expect(cancellation).toEqual({
		status: 200,
		value: { requestId: "sdk-request-1" },
	});
	await post("/settled", {
		sessionId: id,
		resolutions: [{ requestId: "sdk-request-1", outcome: "denied" }],
	});
	expect((await post("/authorize", proposal)).status).toBe(422);
	expect(
		(
			await post("/supersede", {
				sessionId: id,
				call_id: proposal.callId,
				reason: "Repeat",
			})
		).status,
	).toBe(422);
});

test("Eve policy requests genuine user approval and denies validation failures", async () => {
	const calls: string[] = [];
	const policy = nativeApprovalPolicy({
		name: "attach",
		gated: true,
		request: async <T>(path: string) => {
			calls.push(path);
			return {} as T;
		},
	});
	expect(typeof policy).toBe("function");
	const handler = policy as (context: unknown) => Promise<unknown>;
	expect(
		await handler({
			session: { id: sessionId },
			callId: "policy",
			toolInput: write.args,
		}),
	).toBe("user-approval");
	expect(calls).toEqual(["/validate"]);
	const denied = nativeApprovalPolicy({
		name: "attach",
		gated: true,
		request: async () => {
			throw new Error("Preview mismatch");
		},
	}) as typeof handler;
	expect(
		await denied({
			session: { id: sessionId },
			callId: "policy",
			toolInput: write.args,
		}),
	).toEqual({ type: "denied", reason: "Preview mismatch" });
});
