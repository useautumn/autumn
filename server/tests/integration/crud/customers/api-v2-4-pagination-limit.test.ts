/**
 * API v2.4 caps customers.list and entities.list at 200.
 *
 * limit <= 200 succeeds; limit > 200 is InvalidRequest naming the max.
 * V2.3 still accepts 201.
 */

import { expect, test } from "bun:test";
import { ErrCode, V2_4_MAX_PAGINATION_LIMIT } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const OVER_LIMIT = V2_4_MAX_PAGINATION_LIMIT + 1;

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
}) =>
	autumn.entitiesV2.list({
		customer_id: customerId,
		limit,
	});

test.concurrent(
	`${chalk.yellowBright("api v2.4 pagination: customers.list caps limit at 200, V2_3 unchanged")}`,
	async () => {
		const customerId = "v24-limit-customers";
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const atLimit = (await listCustomers({
			autumn: autumnV2_4,
			limit: V2_4_MAX_PAGINATION_LIMIT,
		})) as { list: unknown[] };
		expect(
			atLimit.list,
			"v2.4 customers.list at 200 should succeed",
		).toBeArray();

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: `max of ${V2_4_MAX_PAGINATION_LIMIT}`,
			func: () => listCustomers({ autumn: autumnV2_4, limit: OVER_LIMIT }),
		});

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

		const atLimit = (await listEntities({
			autumn: autumnV2_4,
			customerId,
			limit: V2_4_MAX_PAGINATION_LIMIT,
		})) as { list: unknown[] };
		expect(
			atLimit.list,
			"v2.4 entities.list at 200 should succeed",
		).toBeArray();

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: `max of ${V2_4_MAX_PAGINATION_LIMIT}`,
			func: () =>
				listEntities({ autumn: autumnV2_4, customerId, limit: OVER_LIMIT }),
		});

		const v23 = (await listEntities({
			autumn: autumnV2_3,
			customerId,
			limit: OVER_LIMIT,
		})) as { list: unknown[] };
		expect(v23.list, "v2.3 entities.list at 201 should succeed").toBeArray();
	},
);
