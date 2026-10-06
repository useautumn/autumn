import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import { areWorkflowQueuesIdle } from "../../testQueue/areWorkflowQueuesIdle";
import type { createTestWait } from "../../testWait/createTestWait";
import { postStripeEventToWorker } from "../postStripeEventToWorker";
import { listTestClockEvents } from "./listTestClockEvents";
import {
	readStripeWebhookEventStatus,
	type StripeWebhookEventStatus,
} from "./readStripeWebhookEventStatus";
import { runStripeClockRequest } from "./runStripeClockRequest";

const POLL_INTERVAL_MS = 1_500;
// Matches waitForStripeWebhook: twd's shared ingress can miss a delivery, and Stripe's retry backoff is minutes.
const REPLAY_UNDELIVERED_AFTER_MS = 25_000;

type EventStatus = { event: Stripe.Event; status: StripeWebhookEventStatus };

const listClockCustomerIds = async ({
	stripeCli,
	testClockId,
	wait,
}: {
	stripeCli: Stripe;
	testClockId: string;
	wait: ReturnType<typeof createTestWait>;
}) => {
	const customers = await runStripeClockRequest({
		wait,
		run: () =>
			stripeCli.customers
				.list({ test_clock: testClockId, limit: 100 })
				.autoPagingToArray({ limit: 1_000 }),
	});
	return new Set(customers.map((customer) => customer.id));
};

const describeUnprocessed = (statuses: EventStatus[]) =>
	statuses
		.filter(({ status }) => status !== "completed")
		.map(({ event, status }) => `${event.type} ${event.id} (${status})`)
		.join(", ");

/**
 * Waits until Autumn has processed every webhook the clock advance produced, including events its own handlers
 * caused, and drained the jobs those handlers queued. Done once a re-list finds no new or unprocessed events.
 */
export const waitForTestClockWebhooks = async ({
	stripeCli,
	testClockId,
	sinceMs,
	wait,
}: {
	stripeCli: Stripe;
	testClockId: string;
	sinceMs: number;
	wait: ReturnType<typeof createTestWait>;
}) => {
	const startedAt = performance.now();
	const customerIds = await listClockCustomerIds({
		stripeCli,
		testClockId,
		wait,
	});
	let settledEventIds: string | undefined;
	let lastStatuses: EventStatus[] = [];
	let replayed = false;
	let queuesBusy = false;

	try {
		for (;;) {
			const events = await listTestClockEvents({
				stripeCli,
				testClockId,
				customerIds,
				sinceMs,
				wait,
			});
			lastStatuses = await wait.run(() =>
				Promise.all(
					events.map(async (event) => ({
						event,
						status: await readStripeWebhookEventStatus({ event }),
					})),
				),
			);
			const allProcessed = lastStatuses.every(
				({ status }) => status === "completed",
			);
			const eventIds = events.map(({ id }) => id).join(",");

			if (allProcessed && eventIds === settledEventIds) {
				queuesBusy = !(await wait.run(areWorkflowQueuesIdle));
				if (!queuesBusy) return;
			}
			settledEventIds = allProcessed ? eventIds : undefined;

			const undelivered = lastStatuses.filter(
				({ status }) => status === "missing",
			);
			const replayDue =
				performance.now() - startedAt >= REPLAY_UNDELIVERED_AFTER_MS;
			if (!replayed && replayDue && undelivered.length > 0) {
				replayed = true;
				for (const { event } of undelivered) {
					const result = await wait.run(() =>
						postStripeEventToWorker({
							env: event.livemode ? AppEnv.Live : AppEnv.Sandbox,
							event,
						}),
					);
					console.log(`   - Replayed undelivered webhook ${result}`);
				}
			}

			await wait.sleep(POLL_INTERVAL_MS);
		}
	} catch (error) {
		const unprocessed = describeUnprocessed(lastStatuses);
		const pending = unprocessed
			? `webhooks not processed: ${unprocessed}`
			: queuesBusy
				? "workflow queues still busy"
				: undefined;
		if (!pending) throw error;
		throw new Error(`Test clock ${testClockId} did not settle, ${pending}`, {
			cause: error,
		});
	}
};
