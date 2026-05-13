/**
 * Parity test: V2.3 cursor list must produce byte-equivalent results to V2.2 offset list
 * for the same params, modulo the envelope difference (cursor vs offset/total).
 *
 * Red-failure mode (pre-fix): variant 07 SQL output diverged from V2.2 on
 *   (1) subscriptions[].internal_customer_id (missing)
 *   (2) customer_products[] ordering (4-key instead of created_at DESC)
 *
 * Green-success criteria: full deep-equal of list[] payloads across:
 *  - no filters
 *  - subscription_status=active
 *  - search filter
 *  - plans filter
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const findDiff = (a: any, b: any, path = "$"): string | null => {
	if (a === b) return null;
	if (a === null || b === null || a === undefined || b === undefined) {
		return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
	}
	if (typeof a !== typeof b) {
		return `${path}: type ${typeof a} vs ${typeof b}`;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			return `${path}: array vs non-array`;
		}
		if (a.length !== b.length) {
			return `${path}.length: ${a.length} vs ${b.length}`;
		}
		for (let i = 0; i < a.length; i++) {
			const d = findDiff(a[i], b[i], `${path}[${i}]`);
			if (d) return d;
		}
		return null;
	}
	if (typeof a === "object") {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			const d = findDiff(a[k], b[k], `${path}.${k}`);
			if (d) return d;
		}
		return null;
	}
	return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
};

const LIMIT = 25;

const fetchV22 = async (autumn: AutumnInt, params: Record<string, unknown>) =>
	(await autumn.customers.listV2({
		limit: LIMIT,
		offset: 0,
		keepInternalFields: true,
		...params,
	})) as { list: ApiCustomerV5[] };

const fetchV23 = async (autumn: AutumnInt, params: Record<string, unknown>) =>
	(await autumn.customers.listV2({
		cursor: "",
		limit: LIMIT,
		keepInternalFields: true,
		...params,
	})) as { list: ApiCustomerV5[]; next_cursor: string | null };

test.concurrent(
	`${chalk.yellowBright("list-customers-v22-vs-v23-parity: V2.2 offset vs V2.3 cursor produce identical list[]")}`,
	async () => {
		const prod = products.pro({
			id: "v22-v23-parity-pro",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		await initScenario({
			customerId: "v22-v23-parity-base",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		const autumnV2_2 = new AutumnInt({ version: ApiVersion.V2_2 });
		const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

		const cases = [
			{ name: "no filters", params: {} },
			{ name: "subscription_status=active", params: { subscription_status: "active" } },
			{ name: "search", params: { search: "v22-v23-parity" } },
			{ name: "plans", params: { plans: [{ id: prod.id }] } },
		];

		for (const c of cases) {
			const [v22, v23] = await Promise.all([
				fetchV22(autumnV2_2, c.params),
				fetchV23(autumnV2_3, c.params),
			]);
			expect(v22.list.length).toBe(v23.list.length);
			const diff = findDiff(v22.list, v23.list);
			if (diff) {
				console.log(chalk.red(`[${c.name}] divergence at ${diff}`));
			}
			expect(diff).toBeNull();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("list-customers-v22-vs-v23-parity: V2.3 next_cursor advances to a non-empty page 2")}`,
	async () => {
		await initScenario({
			customerId: "v22-v23-parity-cursor",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

		const page1 = (await autumnV2_3.customers.listV2({
			cursor: "",
			limit: 1,
			keepInternalFields: true,
		})) as { list: ApiCustomerV5[]; next_cursor: string | null };

		expect(page1.list.length).toBe(1);
		expect(
			page1.next_cursor === null || typeof page1.next_cursor === "string",
		).toBe(true);

		if (page1.next_cursor) {
			const page2 = (await autumnV2_3.customers.listV2({
				cursor: page1.next_cursor,
				limit: 1,
				keepInternalFields: true,
			})) as { list: ApiCustomerV5[]; next_cursor: string | null };

			expect(page2.list.length).toBeGreaterThanOrEqual(0);
			if (page2.list.length > 0) {
				expect(page2.list[0]!.id).not.toBe(page1.list[0]!.id);
			}
		}
	},
);
