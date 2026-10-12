/**
 * Org-wide invoices.list pages newest-first by (created_at, id) through a cursor.
 *
 * Contract:
 *   invoices.list { status, processor_types, limit }   → newest page + next_cursor
 *   invoices.list { ..., start_cursor }                → continues strictly after the cursor
 */

import { expect, test } from "bun:test";
import type { ApiListInvoiceV1 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type ListPage = { list: ApiListInvoiceV1[]; next_cursor: string | null };

test.concurrent(
	`${chalk.yellowBright("invoices.list: org-wide cursor pages stay newest-first")}`,
	async () => {
		const customerId = "inv-list-org-cursor";
		const runTag = Date.now().toString();
		// Far-future timestamps keep these rows at the head of the org-wide list.
		const newest = Date.UTC(2200, 0, 1) + Number(runTag.slice(-6)) * 10;
		const stripeIds = [0, 1, 2].map((i) => `in_org_cursor_${runTag}_${i}`);

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2_3.post("/invoices.insert", {
			invoices: stripeIds.map((stripe_id, i) => ({
				customer_id: customerId,
				stripe_id,
				status: "paid",
				total: 1,
				created_at: newest - i,
			})),
		});

		const filters = { status: ["paid"], processor_types: ["stripe"], limit: 2 };
		const first = (await autumnV2_3.post(
			"/invoices.list",
			filters,
		)) as ListPage;
		expect(first.list.map((invoice) => invoice.stripe_id)).toEqual(
			stripeIds.slice(0, 2),
		);
		expect(first.next_cursor).toBeTruthy();

		const second = (await autumnV2_3.post("/invoices.list", {
			...filters,
			start_cursor: first.next_cursor,
		})) as ListPage;
		expect(second.list[0]?.stripe_id).toBe(stripeIds[2]);
	},
);
