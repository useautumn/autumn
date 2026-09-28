import type { BrowserContext, Request } from "playwright-core";
import { acquireTwStripePermit } from "../../../src/external/connect/clientCache/twStripeLimiter/acquireTwStripePermit";
import { isTwWorkerMode } from "../../../src/external/connect/clientCache/twStripeLimiter/twStripeMode";

export const limitStripeBrowserRequests = async ({
	context,
}: {
	context: BrowserContext;
}) => {
	if (!isTwWorkerMode()) return;
	const secretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
	const stripeAccount = process.env.STRIPE_ACCOUNT_ID;
	if (!secretKey || !stripeAccount) {
		throw new Error(
			"TW browser admission requires the worker's Stripe account and key",
		);
	}
	const controller = new AbortController();
	const active = new Map<
		Request,
		Awaited<ReturnType<typeof acquireTwStripePermit>>
	>();
	const pending = new Set<Promise<void>>();
	let failure: unknown;
	const track = (operation: Promise<void>) => {
		const tracked = operation
			.catch((error) => {
				failure ??= error;
			})
			.finally(() => pending.delete(tracked));
		pending.add(tracked);
		return tracked;
	};
	const release = async (request: Request) => {
		const permit = active.get(request);
		active.delete(request);
		await permit?.release();
	};
	const finish = (request: Request) => {
		void track(release(request));
	};
	context.on("requestfinished", finish);
	context.on("requestfailed", finish);
	context.once("close", () => controller.abort());
	context.on("response", (response) => {
		const permit = active.get(response.request());
		if (!permit || process.env.TW_STRIPE_TRACE !== "1") return;
		const headers = response.headers();
		console.log(
			JSON.stringify({
				event: "tw.stripe.browser",
				at: new Date().toISOString(),
				method: response.request().method(),
				status: response.status(),
				waitMs: permit.waitMs,
				stripeRequestId: headers["request-id"] ?? null,
				rateLimitedReason: headers["stripe-rate-limited-reason"] ?? null,
			}),
		);
	});

	// The secret identifies the shared Redis budget; it is never sent to Chromium or Stripe here.
	await context.route(/^https:\/\/api\.stripe\.com\/v[12]\//, (route) =>
		track(
			(async () => {
				const request = route.request();
				try {
					const permit = await acquireTwStripePermit({
						authorization: `Bearer ${secretKey}`,
						stripeAccount,
						timeoutMs: 60_000,
						signal: controller.signal,
					});
					active.set(request, permit);
					await route.fallback();
				} catch (error) {
					if (!controller.signal.aborted) failure ??= error;
					await release(request);
					await route.abort().catch(() => {});
				}
			})(),
		),
	);

	const close = async () => {
		controller.abort();
		await Promise.all(pending);
		await Promise.all([...active.keys()].map(release));
		if (failure) throw failure;
	};
	return { close };
};
