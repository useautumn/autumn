/**
 * Contract test for the V2_4 pagination ceiling.
 *
 * Contract under test:
 *   New behaviors:
 *     - At V2_4, customers.list and entities.list cap `limit` at 200.
 *       limit <= 200 -> 200 OK
 *       limit >  200 -> 400 InvalidRequest, message names the max
 *     - <= V2_3 is unchanged (ListCustomers max 1000, ListEntities max 5000),
 *       so a limit of 201 is still accepted.
 *     - A per-org pagination override still wins over the V2_4 default, so ops
 *       keeps an escape hatch. (Not asserted here — it needs edge config.)
 *   Side effects:
 *     - none.
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const V2_4_MAX = 200;
const OVER_LIMIT = V2_4_MAX + 1;

const listCustomers = ({
	autumn,
	limit,
}: {
	autumn: AutumnInt;
	limit: number;
}) => autumn.customers.listV2({ limit });

const listEntities = ({
	autumn,
	customerId,
	limit,
}: {
	autumn: AutumnInt;
	customerId: string;
	limit: number;
}) => autumn.post("/entities.list", { customer_id: customerId, limit });

const expectRejectedForLimit = async ({
	label,
	call,
}: {
	label: string;
	call: () => Promise<unknown>;
}) => {
	let error: unknown;
	try {
		await call();
	} catch (caught) {
		error = caught;
	}

	expect(error, `${label}: expected a rejection`).toBeDefined();
	expect(
		String((error as { message?: string })?.message ?? error),
		`${label}: error should name the 200 max`,
	).toContain(`max of ${V2_4_MAX}`);
};

test.concurrent(
	`${chalk.yellowBright("api v2.4 pagination: customers.list caps limit at 200, V2_3 unchanged")}`,
	async () => {
		const customerId = "v24-limit-customers";
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// ── Contract: V2_4 accepts the ceiling exactly.
		const atLimit = (await listCustomers({
			autumn: autumnV2_4,
			limit: V2_4_MAX,
		})) as { list: unknown[] };
		expect(
			atLimit.list,
			"v2.4 customers.list at 200 should succeed",
		).toBeArray();

		// ── Contract: V2_4 rejects anything above it.
		await expectRejectedForLimit({
			label: "v2.4 customers.list",
			call: () => listCustomers({ autumn: autumnV2_4, limit: OVER_LIMIT }),
		});

		// ── Contract: V2_3 is unchanged — 201 is still fine.
		const v23 = (await listCustomers({
			autumn: autumnV2_3,
			limit: OVER_LIMIT,
		})) as { list: unknown[] };
		expect(v23.list, "v2.3 customers.list at 201 should succeed").toBeArray();
	},
);

test.concurrent(
	`${chalk.yellowBright("api v2.4 pagination: entities.list caps limit at 200, V2_3 unchanged")}`,
	async () => {
		const customerId = "v24-limit-entities";
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// ── Contract: V2_4 accepts the ceiling exactly.
		const atLimit = (await listEntities({
			autumn: autumnV2_4,
			customerId,
			limit: V2_4_MAX,
		})) as { list: unknown[] };
		expect(
			atLimit.list,
			"v2.4 entities.list at 200 should succeed",
		).toBeArray();

		// ── Contract: V2_4 rejects anything above it.
		await expectRejectedForLimit({
			label: "v2.4 entities.list",
			call: () =>
				listEntities({ autumn: autumnV2_4, customerId, limit: OVER_LIMIT }),
		});

		// ── Contract: V2_3 is unchanged — 201 is still fine.
		const v23 = (await listEntities({
			autumn: autumnV2_3,
			customerId,
			limit: OVER_LIMIT,
		})) as { list: unknown[] };
		expect(v23.list, "v2.3 entities.list at 201 should succeed").toBeArray();
	},
);
