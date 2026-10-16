/**
 * `customer.has_paid` end to end, against real invoices.
 *
 * Contract under test:
 *   - The migration filter `{ has_paid: false }` selects the never-paid
 *     customer only; `{ has_paid: true }` selects the paying one only.
 *   - `invoiceRepo.customerHasPaidInvoice` (the lazy path's loader) agrees.
 *
 * The lazy enqueue itself is kill-switched (`LAZY_MIGRATION_RUNS_DISABLED`,
 * see lazy-run-disabled.test.ts); its matching is covered by the unit test
 * `check-pending-migrations-has-paid.test.ts`.
 */

import { expect, test } from "bun:test";
import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { invoiceRepo } from "@/internal/invoices/repos/invoiceRepo.js";
import {
	type CustomerRow,
	filterCustomers,
} from "@/internal/migrations/v2/filters/customers/filterCustomers.js";

const collectIds = async ({
	batches,
}: {
	batches: AsyncGenerator<CustomerRow[]>;
}): Promise<string[]> => {
	const ids: string[] = [];
	for await (const batch of batches) {
		for (const row of batch) if (row.id) ids.push(row.id);
	}
	return ids.sort();
};

test.concurrent(
	`${chalk.yellowBright("customer.has_paid: filter and loader split paid from never-paid")}`,
	async () => {
		const pfx = `has-paid-${Math.random().toString(36).slice(2, 8)}`;
		const paidId = `${pfx}-paid`;
		const freeId = `${pfx}-free`;

		const pro = products.pro({
			id: `${pfx}-pro`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const free = products.base({
			id: `${pfx}-free`,
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});

		const { ctx } = await initScenario({
			customerId: paidId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([{ id: freeId }]),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: free.id, customerId: freeId }),
			],
		});

		const neverPaid = CustomerFilterSchema.parse({ has_paid: false });
		const hasPaid = CustomerFilterSchema.parse({ has_paid: true });

		expect(
			await collectIds({
				batches: filterCustomers({ ctx, filter: neverPaid, search: pfx }),
			}),
		).toEqual([freeId]);
		expect(
			await collectIds({
				batches: filterCustomers({ ctx, filter: hasPaid, search: pfx }),
			}),
		).toEqual([paidId]);

		for (const [customerId, expected] of [
			[paidId, true],
			[freeId, false],
		] as const) {
			const customer = await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(
				await invoiceRepo.customerHasPaidInvoice({
					ctx,
					internalCustomerId: customer?.internal_id ?? "",
				}),
			).toBe(expected);
		}
	},
);
