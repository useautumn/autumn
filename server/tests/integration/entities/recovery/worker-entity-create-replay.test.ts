/**
 * entities.create on the balance worker path: a worker outage during the create is replayed
 * from the customer creation recovery queue.
 *
 * Contract under test:
 * - With `x-balance-worker-outage`, the entity's worker write fails as unreachable: the
 *   request answers the worker's own 503 and no entity exists.
 * - The failed request itself enqueues the EntityCreationRecovery job; the REAL worker process
 *   consumes it off SQS and creates the entity, readable through entities.get.
 * - A second replay of the same request finds the entity and succeeds without creating another.
 */

import { expect, test } from "bun:test";
import { type ApiEntityV2, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type AutumnError from "@/external/autumn/autumnCli.js";
import { isLockConflict } from "@/external/redis/utils/lockUtils/acquireLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { EntityCreationRecoveryPayload } from "@/internal/entities/recovery/entityCreationRecoveryTypes.js";
import { replayFailedEntityCreation } from "@/internal/entities/recovery/replayFailedEntityCreation.js";

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
	`${chalk.yellowBright("worker entities.create replay: outage during create is replayed and the entity is readable")}`,
	async () => {
		const customerId = "worker-entity-create-replay";
		const entityId = "replayed-seat";
		// Per run: the FIFO dedupe id is derived from the request, and a repeat inside the dedupe window would be dropped.
		const entityName = `Replayed Seat ${Date.now()}`;
		// A free seat grant: the create deducts a seat on the worker and never invoices.
		const seats = products.base({
			id: "seats",
			items: [items.freeUsers({ includedUsage: 5 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [seats] })],
			actions: [s.attach({ productId: seats.id })],
		});

		const getEntity = () =>
			autumnV2_3.post("/entities.get", {
				customer_id: customerId,
				entity_id: entityId,
			}) as Promise<ApiEntityV2>;

		// ── 1. Outage held open for this request: the worker write never lands ──
		const code = await rejectedCode(
			autumnV2_3.post(
				"/entities.create",
				{
					customer_id: customerId,
					entity_id: entityId,
					name: entityName,
					feature_id: TestFeature.Users,
				},
				{ "x-balance-worker-outage": "true" },
			),
		);
		expect(code).toBe("balance_worker_unavailable");
		expect(await rejectedCode(getEntity())).toBe("entity_not_found");

		// ── 2. The failed request enqueued its own recovery; the dev worker consumes it ──
		const replayed = await waitFor<ApiEntityV2>({
			description: "entity created by the recovery replay",
			fetch: async () => {
				try {
					return await getEntity();
				} catch {
					return undefined;
				}
			},
		});
		expect(replayed.id).toBe(entityId);
		expect(replayed.feature_id).toBe(TestFeature.Users);
		expect(replayed.name).toBe(entityName);

		// ── 3. Replaying again finds the entity and succeeds. The entity is readable
		// before the queue consumer releases the create lock, so a conflict is retried. ──
		const payload: EntityCreationRecoveryPayload = {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			requestId: "req_worker_entity_create_replay",
			apiVersion: ApiVersion.V2_3,
			params: {
				customerId,
				createEntityData: [
					{ id: entityId, name: entityName, feature_id: TestFeature.Users },
				],
			},
			failedAt: Date.now(),
		};
		const replayCtx = {
			...ctx,
			extraLogs: {} as AutumnContext["extraLogs"],
			state: {},
		};
		await waitFor({
			description: "second replay past the consumer's create lock",
			fetch: async () => {
				try {
					await replayFailedEntityCreation({ ctx: replayCtx, payload });
					return true;
				} catch (error) {
					if (isLockConflict(error)) return undefined;
					throw error;
				}
			},
		});
		expect(replayCtx.extraLogs.entityCreationRecoveryReplay).toMatchObject({
			outcome: "existing",
		});

		const { list } = (await autumnV2_3.post("/entities.list", {
			customer_id: customerId,
		})) as { list: ApiEntityV2[] };
		expect(list.filter((entity) => entity.id === entityId)).toHaveLength(1);
	},
);
