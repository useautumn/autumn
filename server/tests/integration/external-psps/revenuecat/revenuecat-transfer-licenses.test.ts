/**
 * A transferred plan carries its license pool. Seats held by the source's entities
 * are released and expired, so the destination gets an unassigned pool.
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	newRcClient,
	purchaseOnA,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

test.concurrent(
	`${chalk.yellowBright("rc transfer: license pool moves and the source's assigned seats are released")}`,
	async () => {
		const customerA = "rc-xfer-lic";
		const customerB = `${customerA}-b`;
		const parent = products.base({
			id: "rc-xfer-lic-parent",
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "rc-xfer-lic-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { entities, autumnV2_3 } = await setupCustomers({
			customerId: customerA,
			plans: [parent, seat],
			entityCount: 2,
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seat.id,
					included: 2,
				}),
			],
		});
		const { mock } = await purchaseOnA({
			plan: parent,
			rcStoreId: "com.app.rc_xfer_lic",
			rcInternalId: "prod_rc_xfer_lic",
			subId: "sub_rc_xfer_lic",
			customerId: customerA,
		});
		await autumnV2_3.post("/licenses.attach", {
			customer_id: customerA,
			plan_id: seat.id,
			entities: [{ entity_id: entities[0].id }],
		});
		const before = await getLicenseDbState({
			db: ctx.db,
			customerId: customerA,
		});
		expect(before.pools).toHaveLength(1);
		expect(
			before.assignments.filter((cp) => cp.internal_entity_id),
		).toHaveLength(1);

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);

		const onA = await getLicenseDbState({ db: ctx.db, customerId: customerA });
		const onB = await getLicenseDbState({ db: ctx.db, customerId: customerB });
		expect(onA.pools).toHaveLength(0);
		expect(
			onA.assignments.filter(
				(cp) => cp.internal_entity_id && cp.status === CusProductStatus.Active,
			),
		).toHaveLength(0);
		expect(onB.pools.map((pool) => pool.id)).toEqual(
			before.pools.map((pool) => pool.id),
		);
		expect(onB.assignments.filter((cp) => cp.internal_entity_id)).toHaveLength(
			0,
		);
	},
);
