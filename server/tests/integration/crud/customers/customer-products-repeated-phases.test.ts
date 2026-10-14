/**
 * A schedule phase that repeats the one before it keeps the same customer_products
 * row running, so the products page carries that row's later phase starts.
 *
 * Contract: each products-page row has `repeated_phase_starts: number[]`, the
 * starts of every later schedule phase still running it (empty when none), on
 * both the customer products page and the customer list's seeded page.
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

const repeatedStartsByStatus = (list: CustomerProductsPageItem[]) =>
	Object.fromEntries(
		list.map((row) => [row.status, row.repeated_phase_starts]),
	);

test.concurrent(
	`${chalk.yellowBright("customer products page: a scheduled row lists the later phases that repeat it")}`,
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
		const repeatStart = renewalStart + ms.days(365);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: enterprise.id }] },
				renewal({ planId: enterprise.id, startsAt: renewalStart }),
				renewal({ planId: enterprise.id, startsAt: repeatStart }),
			],
		};
		const { phases } = await autumnV2_4.billing.setPlans(params);
		const savedRepeatStart = phases[2].starts_at;

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, status: "active" },
		});
		expect(repeatedStartsByStatus(page.list)).toEqual({
			[CusProductStatus.Active]: [],
			[CusProductStatus.Scheduled]: [savedRepeatStart],
		});

		const { fullCustomers } = await CusBatchService.getDashboardCursorPage({
			ctx,
			search: customerId,
			cursor: null,
			limit: 10,
		});
		const seededPage = fullCustomers.find(
			(customer) => customer.id === customerId,
		)?.products_page;
		expect(repeatedStartsByStatus(seededPage?.list ?? [])).toEqual({
			[CusProductStatus.Active]: [],
			[CusProductStatus.Scheduled]: [savedRepeatStart],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("customer products page: an active row lists the next phase when it repeats the current one")}`,
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

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, status: "active" },
		});
		expect(repeatedStartsByStatus(page.list)).toEqual({
			[CusProductStatus.Active]: [phases[1].starts_at],
		});
	},
);
