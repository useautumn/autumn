import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { waitForWebhook } from "../../integration/utils/svixWebhookTestUtils";

afterEach(() => mock.restore());

test("a hung Svix request is aborted within the webhook deadline", async () => {
	let requestSignal: AbortSignal | null | undefined;
	const fetchRequest = (
		...[_url, options]: Parameters<typeof globalThis.fetch>
	) => {
		requestSignal = options?.signal;
		return new Promise<Response>(() => {});
	};
	const fetch = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(fetchRequest, { preconnect: globalThis.fetch.preconnect }),
	);
	const startedAt = performance.now();
	const result = await waitForWebhook({
		token: "test-token",
		predicate: () => true,
		timeoutMs: 30,
	});
	expect(result).toBeNull();
	expect(requestSignal?.aborted).toBe(true);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(performance.now() - startedAt).toBeLessThan(500);
});

test("the webhook deadline also bounds an unfinished response body", async () => {
	spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(new ReadableStream({ start() {} })),
	);
	await expect(
		waitForWebhook({
			token: "test-token",
			predicate: () => true,
			timeoutMs: 30,
		}),
	).resolves.toBeNull();
});

test("cancellation during a polling delay prevents the next request", async () => {
	const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ data: [] }),
	);
	const controller = new AbortController();
	const pending = waitForWebhook({
		token: "test-token",
		predicate: () => true,
		signal: controller.signal,
	});
	await Bun.sleep(10);
	controller.abort(new Error("test cancelled"));
	await expect(pending).rejects.toThrow("test cancelled");
	expect(fetch).toHaveBeenCalledTimes(1);
});

test("a matching webhook returns immediately after ignoring invalid events", async () => {
	const payload = { type: "customer.products.updated" };
	const event = {
		body: Buffer.from(JSON.stringify(payload)).toString("base64"),
	};
	spyOn(globalThis, "fetch").mockResolvedValue(
		Response.json({ data: [{ body: "invalid" }, event] }),
	);
	const result = await waitForWebhook<typeof payload>({
		token: "test-token",
		predicate: (received) => received.type === payload.type,
		logWebhook: false,
	});
	expect(result?.payload).toEqual(payload);
	expect(result?.event.body).toBe(event.body);
});

test("Svix HTTP errors stay visible instead of becoming delivery timeouts", async () => {
	spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(null, { status: 503 }),
	);
	await expect(
		waitForWebhook({ token: "test-token", predicate: () => true }),
	).rejects.toThrow("Failed to get Svix Play history: 503");
});
