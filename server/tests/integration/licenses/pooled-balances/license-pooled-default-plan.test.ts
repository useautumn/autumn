/**
 * Contract: a plan applied as a DEFAULT mints its pooled balances, exactly as
 * billing.attach does. Customer creation used to insert the customer products
 * without computing the pooled balance transition, so the customer_licenses row
 * existed with no pool behind it — check denied, feature absent from balances.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	LICENSE_POOLED_GRANT,
	pooledMonthlyMessages,
	pooledSeatPlan,
} from "./utils/licensePooledBalanceTestUtils.js";

const INCLUDED_SEATS = 1;

test(
	`${chalk.yellowBright("license pooled: a default parent plan mints its pool on customer creation")}`,
	async () => {
		const prefix = "lic-pool-default";
		// Free parent carrying no credit item, linked to an unpriced license plan
		// that holds the pooled item — the shape a default plan is set up in.
		const parent = products.base({
			id: `${prefix}-parent`,
			items: [items.dashboard()],
			isDefault: true,
		});
		const seatPlan = pooledSeatPlan({
			id: `${prefix}-seat`,
			item: pooledMonthlyMessages({ includedUsage: LICENSE_POOLED_GRANT }),
			group: `${prefix}-seats`,
		});

		const { autumnV2_3 } = await initScenario({
			customerId: `${prefix}-customer`,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, seatPlan] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: seatPlan.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		// A fresh customer picks the parent up as its default — no attach call.
		const customerId = `${prefix}-defaulted`;
		await autumnV2_3.createCustomer({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		const pooled = customer.balances?.[TestFeature.Messages];
		expect(pooled?.granted).toBe(LICENSE_POOLED_GRANT * INCLUDED_SEATS);
		expect(pooled?.remaining).toBe(LICENSE_POOLED_GRANT * INCLUDED_SEATS);

		const { allowed } = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(allowed).toBe(true);
	},
	{ timeout: 240_000 },
);
