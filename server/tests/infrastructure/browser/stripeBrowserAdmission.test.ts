import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { type Browser, type BrowserContext, chromium } from "playwright-core";
import { acquireTwStripePermit } from "../../../src/external/connect/clientCache/twStripeLimiter/acquireTwStripePermit";
import { withTwStripeWebhookPriority } from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeRequestContext";
import { getChromiumPath } from "../../utils/browserPool/browserConfig";
import { limitStripeBrowserRequests } from "../../utils/browserPool/limitStripeBrowserRequests";

const redis = new Redis(
	process.env.TW_STRIPE_REDIS_URL ?? "redis://127.0.0.1:7179",
	{
		maxRetriesPerRequest: 0,
	},
);
const secret = `sk_test_fixture_${crypto.randomUUID()}`;
const account = `acct_fixture_${crypto.randomUUID()}`;
const prefix = `tw:stripe:{${createHash("sha256").update(`Bearer ${secret}`).digest("hex")}}`;
const accountPrefix = `${prefix}:${createHash("sha256").update(account).digest("hex")}`;
const environment = {
	TW_WORKER_MODE: "1",
	TW_STRIPE_REDIS_URL:
		process.env.TW_STRIPE_REDIS_URL ?? "redis://127.0.0.1:7179",
	TW_STRIPE_MAX_RPS: "20",
	TW_STRIPE_MAX_INFLIGHT: "2",
	STRIPE_SANDBOX_SECRET_KEY: secret,
	STRIPE_ACCOUNT_ID: account,
};
const previous = Object.fromEntries(
	Object.keys(environment).map((key) => [key, process.env[key]]),
);
let browser: Browser;
beforeAll(async () => {
	Object.assign(process.env, environment);
	browser = await chromium.launch({
		headless: true,
		executablePath: getChromiumPath(),
		args: ["--no-sandbox"],
	});
});
afterAll(async () => {
	await browser?.close();
	const keys = await redis.keys(`${prefix}:*`);
	if (keys.length) await redis.del(...keys);
	redis.disconnect();
	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

const acquire = () =>
	acquireTwStripePermit({
		authorization: `Bearer ${secret}`,
		stripeAccount: account,
		timeoutMs: 5000,
	});
const waitForQueue = async () => {
	const deadline = Date.now() + 3000;
	while ((await redis.zcard(`${accountPrefix}:waiting`)) === 0) {
		if (Date.now() > deadline)
			throw new Error("Browser request did not enter the shared queue");
		await Bun.sleep(10);
	}
};
const fixture = async ({
	context,
	holdResponse,
}: {
	context: BrowserContext;
	holdResponse?: Promise<void>;
}) => {
	const received: Record<string, string>[] = [];
	await context.route("**/*", async (route) => {
		if (new URL(route.request().url()).hostname === "api.stripe.com") {
			received.push(route.request().headers());
			await holdResponse;
			await route
				.fulfill({
					json: { ok: true },
					headers: { "access-control-allow-origin": "*" },
				})
				.catch(() => {});
		} else {
			await route.fulfill({
				contentType: "text/html",
				body: "<p>Checkout fixture</p>",
			});
		}
	});
	const admission = await limitStripeBrowserRequests({ context });
	const page = await context.newPage();
	await page.goto("https://fixture.test/");
	const fetch = () =>
		page.evaluate(async () =>
			(
				await window.fetch(
					"https://api.stripe.com/v1/payment_pages/cs_test_fixture/confirm",
					{ method: "POST" },
				)
			).json(),
		);
	return { admission, fetch, received };
};

test("Chromium shares SDK admission while a webhook can use its reserved slot", async () => {
	const context = await browser.newContext();
	const browserFixture = await fixture({ context });
	const sdk = await acquire();
	let webhook: Awaited<ReturnType<typeof acquire>> | undefined;
	const response = browserFixture.fetch();
	try {
		await waitForQueue();
		webhook = await withTwStripeWebhookPriority(acquire);
		expect(browserFixture.received).toHaveLength(0);
		await sdk.release();
		expect(await response).toEqual({ ok: true });
		expect(browserFixture.received).toHaveLength(1);
		expect(JSON.stringify(browserFixture.received)).not.toContain(secret);
	} finally {
		await sdk.release();
		await webhook?.release();
		await context.close();
		await browserFixture.admission?.close();
		await response.catch(() => {});
	}
	expect(await redis.zcard(`${prefix}:active`)).toBe(0);
}, 10_000);

test("closing a context cancels queued browser admission without leaking permits", async () => {
	const context = await browser.newContext();
	const browserFixture = await fixture({ context });
	const sdk = await acquire();
	const response = browserFixture.fetch().catch(() => {});
	try {
		await waitForQueue();
		await context.close();
		await browserFixture.admission?.close();
		expect(browserFixture.received).toHaveLength(0);
		expect(await redis.zcard(`${accountPrefix}:waiting`)).toBe(0);
		expect(await redis.zcard(`${prefix}:active`)).toBe(1);
	} finally {
		await sdk.release();
		await context.close();
		await browserFixture.admission?.close();
		await response;
	}
	const next = await acquire();
	await next.release();
	expect(await redis.zcard(`${prefix}:active`)).toBe(0);
}, 10_000);

test("closing a context releases an in-flight browser request", async () => {
	const context = await browser.newContext();
	const held = Promise.withResolvers<void>();
	const browserFixture = await fixture({ context, holdResponse: held.promise });
	const response = browserFixture.fetch().catch(() => {});
	try {
		const deadline = Date.now() + 3000;
		while (!browserFixture.received.length) {
			if (Date.now() > deadline)
				throw new Error("Browser request was not admitted");
			await Bun.sleep(10);
		}
		expect(await redis.zcard(`${prefix}:active`)).toBe(1);
		await context.close();
		held.resolve();
		await browserFixture.admission?.close();
		expect(await redis.zcard(`${prefix}:active`)).toBe(0);
	} finally {
		held.resolve();
		await context.close();
		await browserFixture.admission?.close();
		await response;
	}
}, 10_000);
