import type { AppEnv } from "@autumn/shared";
import { stripeRefToId } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect.js";
import type Stripe from "stripe";

const DEFAULT_REPLAY_AFTER_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;

const CHECKOUT_SESSION_ID_RE = /(cs_[A-Za-z0-9_]+)/;

export const checkoutSessionIdFromUrl = (url: string): string => {
	const id = CHECKOUT_SESSION_ID_RE.exec(url)?.[1];
	if (!id) throw new Error(`No checkout session id in URL: ${url}`);
	return id;
};

const backendUrl = () =>
	process.env.AUTUMN_BACKEND_URL || "http://localhost:8080";

export const waitForStripeWebhook = async ({
	stripeCli,
	env,
	until,
	types,
	since,
	objectId,
	customerStripeId,
	describeOnTimeout,
	timeoutMs = WEBHOOK_SETTLE_TIMEOUT_MS,
	replayAfterMs = DEFAULT_REPLAY_AFTER_MS,
}: {
	stripeCli: Stripe;
	env: AppEnv;
	until: () => Promise<boolean>;
	types: string[];
	since?: number;
	objectId?: string;
	customerStripeId?: string;
	describeOnTimeout?: () => Promise<string>;
	timeoutMs?: number;
	replayAfterMs?: number;
}): Promise<void> => {
	const startedAt = Date.now();
	const createdGte = Math.floor((since ?? startedAt - 10 * 60 * 1000) / 1000);
	let replayReport: string | undefined;

	while (true) {
		if (await until()) return;

		const elapsed = Date.now() - startedAt;
		if (elapsed >= timeoutMs) {
			const description = describeOnTimeout
				? ` — ${await describeOnTimeout().catch((error) => `describe failed: ${error}`)}`
				: "";

			throw new Error(
				`Timed out after ${timeoutMs}ms waiting for ${types.join(", ")}` +
					(replayReport === undefined
						? " (no replay attempted)"
						: ` (replay: ${replayReport} — still no effect)`) +
					description,
			);
		}

		if (replayReport === undefined && elapsed >= replayAfterMs) {
			replayReport = await replayStripeEvents({
				stripeCli,
				env,
				types,
				createdGte,
				objectId,
				customerStripeId,
			});
		}

		await timeout(POLL_INTERVAL_MS);
	}
};

const replayStripeEvents = async ({
	stripeCli,
	env,
	types,
	createdGte,
	objectId,
	customerStripeId,
}: {
	stripeCli: Stripe;
	env: AppEnv;
	types: string[];
	createdGte: number;
	objectId?: string;
	customerStripeId?: string;
}): Promise<string> => {
	const events = await stripeCli.events.list({
		types,
		created: { gte: createdGte },
		limit: 25,
	});
	console.log(
		`[waitForStripeWebhook] stripe had ${events.data.length} event(s) matching ${types.join(", ")}`,
	);

	const isMine = (event: Stripe.Event) => {
		const object = event.data.object as {
			id?: string;
			customer?: string | { id?: string };
		};
		if (objectId) return object.id === objectId;
		if (customerStripeId) {
			const owner = stripeRefToId(object.customer);
			return owner === customerStripeId;
		}
		return true;
	};

	const mine = events.data.filter(isMine);

	if (mine.length === 0 && events.data.length > 0) {
		const owners = events.data
			.map((event) => {
				const object = event.data.object as {
					id?: string;
					customer?: string | { id?: string };
				};
				const owner = stripeRefToId(object.customer);
				return `${object.id}/${owner ?? "no-customer"}`;
			})
			.slice(0, 6);
		return `0/${events.data.length} — wanted ${objectId ?? customerStripeId}, saw [${owners.join(", ")}]`;
	}

	const statuses: string[] = [];
	for (const event of mine.reverse()) {
		const response = await fetch(`${backendUrl()}/webhooks/connect/${env}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(event),
		});
		const detail = response.ok
			? ""
			: `: ${(await response.text()).slice(0, 300)}`;
		statuses.push(`${event.id}→${response.status}${detail}`);
	}
	return `${mine.length}/${events.data.length} event(s) [${statuses.join(", ")}]`;
};
