import type Stripe from "stripe";
import type { createTwStripeRequestDeadline } from "../twStripeLimiter/createTwStripeRequestDeadline";
import { withTwStripeRequestDeadline } from "../twStripeLimiter/twStripeRequestContext";

export const waitForTwStripeScheduleClock = async ({
	client,
	method,
	path,
	headers,
	deadline,
	networkTimeoutMs,
}: {
	client: Stripe;
	method: string;
	path: string;
	headers: Record<string, string>;
	deadline: ReturnType<typeof createTwStripeRequestDeadline>;
	networkTimeoutMs: number;
}) => {
	if (method !== "POST") return;
	const scheduleId = path.match(
		/^\/v1\/subscription_schedules\/([^/?]+)(?:\/(?:release|cancel))?$/,
	)?.[1];
	if (!scheduleId) return;

	const requestHeaders = new Headers(headers);
	const requestOptions = (): Stripe.RequestOptions => ({
		apiKey: requestHeaders.get("authorization")?.replace(/^Bearer /, ""),
		stripeAccount: requestHeaders.get("stripe-account") ?? undefined,
		stripeContext: requestHeaders.get("stripe-context") ?? undefined,
		apiVersion: requestHeaders.get("stripe-version") ?? undefined,
		timeout: Math.min(networkTimeoutMs, 10_000, deadline.remainingMs()),
		maxNetworkRetries: 0,
	});
	const read = <T>(run: () => Promise<T>) =>
		withTwStripeRequestDeadline({
			timeoutMs: deadline.remainingMs(),
			signal: deadline.signal,
			run,
		});

	const schedule = await read(() =>
		client.subscriptionSchedules.retrieve(
			decodeURIComponent(scheduleId),
			{ expand: ["test_clock"] },
			requestOptions(),
		),
	);
	if (!schedule.test_clock) return;
	const clockId =
		typeof schedule.test_clock === "string"
			? schedule.test_clock
			: schedule.test_clock.id;
	const retrieveClock = () =>
		read(() =>
			client.testHelpers.testClocks.retrieve(clockId, requestOptions()),
		);
	let clock =
		typeof schedule.test_clock === "string"
			? await retrieveClock()
			: schedule.test_clock;
	const startedAt = performance.now();

	// Only schedule mutations wait; renewal invoice webhooks must be able to finish during advancement.
	while (clock.status !== "ready") {
		if (clock.status === "internal_failure")
			throw new Error(
				"Stripe test clock failed while waiting to modify a schedule",
			);
		await deadline.sleep(3_000);
		clock = await retrieveClock();
	}
	deadline.remainingMs();
	if (process.env.TW_STRIPE_TRACE === "1")
		console.log(
			JSON.stringify({
				event: "tw.stripe.clock.wait",
				at: new Date().toISOString(),
				waitMs: Math.round(performance.now() - startedAt),
			}),
		);
};
