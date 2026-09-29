/**
 * balances.list — customer_entitlements as breakdown rows, plan-backed and loose, live or expired.
 *
 * Contract:
 *   POST /v1/balances.list { customer_id?, entity_id?, feature_id?, statuses?[], plan_id?, limit, start_cursor }
 *     -> { list: BalanceListRow[], has_more, next_cursor }
 *   - expired = its customer_product is expired, or a loose grant whose expires_at has passed
 *   - statuses omitted → active only; ["expired"] → expired only; values combine
 *   - plan_id: null → loose grants only (balances.create, top-ups, rollovers)
 *   - id = external id (balance_id) when set, else the internal id
 *   - rollovers ride on their balance row
 *
 * Red (before): the route does not exist.
 * Green (after): every assertion below holds.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type BalanceListRow,
	ResetInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listBalances, walkAllPages } from "../utils/listHistoryClient.js";

const sources = (rows: BalanceListRow[]) =>
	rows.map((row) => `${row.plan_id ?? "loose"}:${row.feature_id}`).sort();

test.concurrent(
	`${chalk.yellowBright("balances.list: plan-backed and loose grants, expired vs live, filters and walk")}`,
	async () => {
		const pro = products.pro({
			id: "lh-bal-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "lh-bal-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const pack = products.oneOff({
			id: "lh-bal-pack",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "lh-bal-sources",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, pack] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({
					productId: pack.id,
					options: [{ feature_id: TestFeature.Words, quantity: 100 }],
				}),
			],
		});

		const expiredAt = Date.now() - 60_000;
		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			included_grant: 50,
			expires_at: expiredAt,
			balance_id: "bonus-old",
		});
		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 25,
			balance_id: "bonus-live",
		});

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId },
		});
		expect(sources(live.list)).toEqual(
			[
				`${premium.id}:${TestFeature.Messages}`,
				`${pack.id}:${TestFeature.Words}`,
				`loose:${TestFeature.Messages}`,
			].sort(),
		);
		expect(live.list.every((row) => row.status === "active")).toBe(true);
		const liveLoose = live.list.find((row) => row.plan_id === null);
		expect(liveLoose?.id).toBe("bonus-live");
		expect(liveLoose?.included_grant).toBe(25);
		expect(liveLoose?.customer_id).toBe(customerId);

		const expired = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"] },
		});
		expect(sources(expired.list)).toEqual(
			[
				`${pro.id}:${TestFeature.Messages}`,
				`loose:${TestFeature.Words}`,
			].sort(),
		);
		expect(expired.list.every((row) => row.status === "expired")).toBe(true);
		const expiredLoose = expired.list.find((row) => row.plan_id === null);
		expect(expiredLoose?.id).toBe("bonus-old");
		expect(expiredLoose?.expires_at).toBe(expiredAt);
		expect(
			expired.list.find((row) => row.plan_id === pro.id)?.included_grant,
		).toBe(100);

		const expiredLooseOnly = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, statuses: ["expired"], plan_id: null },
		});
		expect(expiredLooseOnly.list.map((row) => row.id)).toEqual(["bonus-old"]);

		const words = await listBalances({
			autumn: autumnV2_4,
			params: {
				customer_id: customerId,
				feature_id: TestFeature.Words,
				statuses: ["active", "expired"],
			},
		});
		expect(sources(words.list)).toEqual(
			[`${pack.id}:${TestFeature.Words}`, `loose:${TestFeature.Words}`].sort(),
		);

		const pages = await walkAllPages({
			fetchPage: (startCursor) =>
				listBalances({
					autumn: autumnV2_4,
					params: {
						customer_id: customerId,
						statuses: ["active", "expired"],
						limit: 2,
						start_cursor: startCursor,
					},
				}),
		});
		const walkedIds = pages.flatMap((page) => page.list.map((row) => row.id));
		expect(walkedIds).toHaveLength(5);
		expect(new Set(walkedIds).size).toBe(5);
		expect(pages.at(-1)?.has_more).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("balances.list: rollovers ride on their balance row")}`,
	async () => {
		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "lh-bal-rollover",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2_4.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 400,
			reset: { interval: ResetInterval.Month },
			rollover: {
				max: 500,
				length: 1,
				duration: RolloverExpiryDurationType.Month,
			},
		});
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 250,
		});
		await timeout(3000);
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await autumnV2_4.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		const live = await listBalances({
			autumn: autumnV2_4,
			params: { customer_id: customerId, feature_id: TestFeature.Messages },
		});
		expect(live.list).toHaveLength(1);
		const [row] = live.list;
		expect(row.plan_id).toBeNull();
		expect(row.included_grant).toBe(400);
		expect(row.rollovers.map((rollover) => rollover.balance)).toEqual([150]);
	},
);
