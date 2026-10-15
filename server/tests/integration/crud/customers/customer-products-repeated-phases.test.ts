/**
 * Identical consecutive schedule phases share one customer_products row, but the
 * dashboard products page lists each phase the row runs as its own row, like Set Plans.
 *
 * Contract: a later future phase running a row adds a scheduled row with that row's id
 * and `phase_starts_at` set to the phase start (null on the row itself), ordered with
 * the scheduled rows, counted in `total_count`, paged by the cursor and in the seed page.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	type CustomerProductsPageItem,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusBatchService } from "@/internal/customers/CusBatchService.js";
import { CusService } from "@/internal/customers/CusService.js";

const enterprisePlan = (id: string) =>
	products.base({
		id,
		items: [items.annualPrice({ price: 18000 }), items.dashboard()],
	});

const renewal = ({
	planId,
	startsAt,
}: {
	planId: string;
	startsAt: number;
}) => ({
	starts_at: startsAt,
	billing_cycle_anchor: "phase_start" as const,
	plans: [
		{
			plan_id: planId,
			customize: { price: { amount: 20000, interval: BillingInterval.Year } },
		},
	],
});

const pageRows = (list: CustomerProductsPageItem[]) =>
	list.map((row) => ({
		id: row.id,
		status: row.status,
		phase_starts_at: row.phase_starts_at,
	}));

test.concurrent(
	`${chalk.yellowBright("customer products page: a phase repeating a scheduled row is its own scheduled row")}`,
	async () => {
		const customerId = "cpp-repeated-scheduled";
		const enterprise = enterprisePlan("cpp-repeated-scheduled-ent");
		const { autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [s.billing.attach({ productId: enterprise.id })],
		});

		const renewalStart = advancedTo + ms.days(110);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: enterprise.id }] },
				renewal({ planId: enterprise.id, startsAt: renewalStart }),
				renewal({
					planId: enterprise.id,
					startsAt: renewalStart + ms.days(365),
				}),
			],
		};
		const { phases } = await autumnV2_4.billing.setPlans(params);
		const [activeId, scheduledId] = phases.map(
			(phase) => phase.customer_product_ids[0],
		);
		const expectedRows = [
			{ id: activeId, status: CusProductStatus.Active, phase_starts_at: null },
			{
				id: scheduledId,
				status: CusProductStatus.Scheduled,
				phase_starts_at: null,
			},
			{
				id: scheduledId,
				status: CusProductStatus.Scheduled,
				phase_starts_at: phases[2].starts_at,
			},
		];

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, status: "active" },
		});
		expect(pageRows(page.list)).toEqual(expectedRows);
		expect(page.total_count).toBe(3);

		const firstPage = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 2, status: "active" },
		});
		const secondPage = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: {
				start_cursor: firstPage.next_cursor ?? "",
				limit: 2,
				status: "active",
			},
		});
		expect(pageRows([...firstPage.list, ...secondPage.list])).toEqual(
			expectedRows,
		);
		expect(secondPage.next_cursor).toBeNull();

		const { fullCustomers } = await CusBatchService.getDashboardCursorPage({
			ctx,
			search: customerId,
			cursor: null,
			limit: 10,
		});
		const seededPage = fullCustomers.find(
			(customer) => customer.id === customerId,
		)?.products_page;
		expect(pageRows(seededPage?.list ?? [])).toEqual(expectedRows);
		expect(seededPage?.total_count).toBe(3);
	},
);

test.concurrent(
	`${chalk.yellowBright("customer products page: a phase repeating the active row is a scheduled row")}`,
	async () => {
		const customerId = "cpp-repeated-active";
		const enterprise = enterprisePlan("cpp-repeated-active-ent");
		const { autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [s.billing.attach({ productId: enterprise.id })],
		});

		const { phases } = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: enterprise.id }] },
				{
					starts_at: advancedTo + ms.days(110),
					plans: [{ plan_id: enterprise.id }],
				},
			],
		});
		const activeId = phases[0].customer_product_ids[0];

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, status: "active" },
		});
		expect(pageRows(page.list)).toEqual([
			{ id: activeId, status: CusProductStatus.Active, phase_starts_at: null },
			{
				id: activeId,
				status: CusProductStatus.Scheduled,
				phase_starts_at: phases[1].starts_at,
			},
		]);
	},
);
