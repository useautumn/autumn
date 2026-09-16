/**
 * /migrations.filter.preview with `source: "item_runs"` — the frozen list a
 * migration shows once it has run.
 *
 * Contract:
 *   source defaults to "filter" (live filter, unchanged behaviour).
 *   source "item_runs" requires migrationId, ignores `filter`, and pages the
 *   customers that have a live item run for the migration — so customers who
 *   newly match the filter are absent until the migration runs again.
 *   search and executionStatuses carry over; "queued" / "not_run" are dropped.
 *   count follows the same source. Each row still carries migration_item_run.
 *   Cursor paging and customer list filters apply to the frozen list too.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import { runChunkedMigration } from "../utils/runChunkedMigration.js";

const sortedIds = (customers: { id: string | null }[]) =>
	customers.map((customer) => customer.id).sort();

test.concurrent(
	`${chalk.yellowBright("filter preview item_runs source: lists only customers a live run claimed")}`,
	async () => {
		const customerId = "preview-item-runs-source";
		const secondId = `${customerId}-second`;
		const thirdId = `${customerId}-third`;
		const lateId = `${customerId}-late`;
		const migrationId = `${customerId}-mig`;
		const plan = products.base({ id: `${customerId}-plan`, items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: secondId }, { id: thirdId }, { id: lateId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: secondId, productId: plan.id }),
					s.billing.attach({ customerId: thirdId, productId: plan.id }),
				),
			],
		});

		const filter = { customer: { plan: { plan_id: plan.id } } };
		const operations = {
			customer: [
				{
					type: "update_plan" as const,
					plan_filter: { plan_id: plan.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		};
		const { migration } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId,
			filter,
			operations,
			controls: { only: [customerId, secondId] },
		});

		const frozen = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
		});
		expect(sortedIds(frozen.customers)).toEqual([customerId, secondId].sort());
		expect(frozen.count).toBe(2);
		for (const customer of frozen.customers) {
			expect(customer.migration_item_run?.status).toBe("succeeded");
		}

		const live = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			filter: filter.customer,
		});
		expect(sortedIds(live.customers)).toEqual(
			[customerId, secondId, thirdId].sort(),
		);

		const searched = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
			search: secondId,
		});
		expect(sortedIds(searched.customers)).toEqual([secondId]);
		expect(searched.count).toBe(1);

		const succeededOnly = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
			executionStatuses: ["succeeded"],
		});
		expect(succeededOnly.count).toBe(2);
		const notRun = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
			executionStatuses: ["not_run", "queued"],
		});
		expect(notRun.count).toBe(0);
		expect(notRun.customers).toHaveLength(0);

		await autumnV2_2.billing.attach({ customer_id: lateId, plan_id: plan.id });
		const stillFrozen = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
		});
		expect(stillFrozen.count).toBe(2);

		await runMigrationInChunks({
			ctx,
			migration,
			migrationRunId: generateId("mrun"),
			dryRun: false,
		});
		const afterRunAgain = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
		});
		expect(sortedIds(afterRunAgain.customers)).toEqual(
			[customerId, secondId, thirdId, lateId].sort(),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("filter preview item_runs source: requires a migrationId")}`,
	async () => {
		const customerId = "preview-item-runs-no-migration";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "migrationId",
			func: () =>
				autumnV2_2.migrationsV2.filterPreview({ source: "item_runs" }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("filter preview item_runs source: pages by cursor and honours customer list filters")}`,
	async () => {
		const customerId = "preview-item-runs-paging";
		const otherIds = [1, 2].map((index) => `${customerId}-${index}`);
		const migrationId = `${customerId}-mig`;
		const plan = products.base({ id: `${customerId}-plan`, items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(otherIds.map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					...otherIds.map((id) =>
						s.billing.attach({ customerId: id, productId: plan.id }),
					),
				),
			],
		});

		await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: { add_items: [itemsV2.dashboard()] },
					},
				],
			},
		});

		const seen: string[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < 3; page++) {
			const result = await autumnV2_2.migrationsV2.filterPreview({
				migrationId,
				source: "item_runs",
				pageSize: 1,
				cursor,
			});
			expect(result.count).toBe(3);
			expect(result.customers).toHaveLength(1);
			seen.push(result.customers[0].id ?? "");
			cursor = result.next_cursor ?? undefined;
			if (page < 2) expect(cursor).toBeTruthy();
		}
		expect(cursor).toBeUndefined();
		expect(seen.sort()).toEqual([customerId, ...otherIds].sort());

		const withoutPlans = await autumnV2_2.migrationsV2.filterPreview({
			migrationId,
			source: "item_runs",
			customerFilters: { none: true },
		});
		expect(withoutPlans.count).toBe(0);
		expect(withoutPlans.customers).toHaveLength(0);
	},
);
