/**
 * customers.get_or_create on the balance worker path: a worker outage during the create is
 * replayed from the customer creation recovery queue.
 *
 * Contract under test:
 * - With `x-balance-worker-outage`, the create's worker write fails as unreachable: the
 *   request answers the worker's own 503 and no customer exists.
 * - The same JobName.CustomerCreationRecovery job the server enqueues, consumed by the REAL
 *   worker process off SQS, creates the customer with its customer_data applied and a
 *   Stripe customer linked (create_in_stripe).
 * - A second replay of the same request is a no-op: the customer is fetched, not re-created,
 *   and keeps the Stripe customer it already has.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type AutumnError from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerCreationRecoveryPayload } from "@/internal/customers/recovery/customerCreationRecoveryTypes.js";
import { replayFailedCustomerCreation } from "@/internal/customers/recovery/replayFailedCustomerCreation.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

const waitFor = async <T>({
	fetch,
	description,
}: {
	fetch: () => Promise<T | undefined>;
	description: string;
}): Promise<T> => {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	while (true) {
		const result = await fetch();
		if (result !== undefined) return result;
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for: ${description}`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
};

const rejectedCode = async (request: Promise<unknown>): Promise<string> => {
	try {
		await request;
	} catch (error) {
		return (error as AutumnError).code;
	}
	throw new Error("Expected the request to be rejected");
};

test.concurrent(
	`${chalk.yellowBright("worker get_or_create replay: outage during create is replayed with customer_data and a Stripe customer")}`,
	async () => {
		const customerId = "worker-get-or-create-replay";
		const customerData = {
			name: "Replayed Customer",
			email: `${customerId}@example.com`,
			create_in_stripe: true,
		};

		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		// ── 1. Outage held open for this request: the worker write never lands ──
		const code = await rejectedCode(
			autumnV2_3.post(
				"/customers.get_or_create",
				{ customer_id: customerId, ...customerData },
				{ "x-balance-worker-outage": "true" },
			),
		);
		expect(code).toBe("balance_worker_unavailable");
		expect(await rejectedCode(autumnV2_3.customers.get(customerId))).toBe(
			"customer_not_found",
		);

		// ── 2. Recover via the QUEUE: the job the server enqueues, consumed by the dev worker ──
		const payload: CustomerCreationRecoveryPayload = {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			requestId: "req_worker_get_or_create_replay",
			apiVersion: ApiVersion.V2_3,
			params: { customer_id: customerId, customer_data: customerData },
			source: "handleGetOrCreateCustomerV2",
			failureStage: "pre_commit",
			failedAt: Date.now(),
		};
		await addTaskToQueue({
			jobName: JobName.CustomerCreationRecovery,
			payload,
		});

		// The replay links Stripe after the row lands, so wait for the whole create.
		const replayed = await waitFor<ApiCustomerV5>({
			description: "customer created by the recovery replay",
			fetch: async () => {
				try {
					const customer =
						await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
					return customer.stripe_id ? customer : undefined;
				} catch {
					return undefined;
				}
			},
		});
		expect(replayed.name).toBe(customerData.name);
		expect(replayed.email).toBe(customerData.email);
		expect(replayed.stripe_id).toBeString();

		// ── 3. Replaying again finds the customer and leaves it alone ──
		const replayCtx = { ...ctx, extraLogs: {} as AutumnContext["extraLogs"] };
		await replayFailedCustomerCreation({ ctx: replayCtx, payload });
		expect(replayCtx.extraLogs.customerCreationRecoveryReplay).toMatchObject({
			outcome: "fetched",
		});

		const afterSecondReplay =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(afterSecondReplay.stripe_id).toBe(replayed.stripe_id);
		expect(afterSecondReplay.name).toBe(customerData.name);
	},
);
