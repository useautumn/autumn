import { expect, test } from "bun:test";
import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	type CustomerRow,
	countCustomers,
	filterCustomers,
} from "@/internal/migrations/v2/filters/customers/filterCustomers.js";

async function collectIds(
	gen: AsyncGenerator<CustomerRow[]>,
): Promise<Set<string>> {
	const ids = new Set<string>();
	for await (const batch of gen) {
		for (const row of batch) if (row.id) ids.add(row.id);
	}
	return ids;
}

test.concurrent(
	`${chalk.yellowBright("migration filter $and/$or: composes independent plan checks")}`,
	async () => {
		const pfx = `comp-flt-${Math.random().toString(36).slice(2, 8)}`;
		const both = `${pfx}-both`;
		const freeOnly = `${pfx}-free`;
		const proOnly = `${pfx}-pro`;
		const other = `${pfx}-other`;

		const planFree = products.base({
			id: `${pfx}-pfree`,
			group: `${pfx}-g1`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planPro = products.base({
			id: `${pfx}-ppro`,
			group: `${pfx}-g2`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planOther = products.base({
			id: `${pfx}-pother`,
			group: `${pfx}-g3`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId: both,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: freeOnly }, { id: proOnly }, { id: other }]),
				s.products({ list: [planFree, planPro, planOther] }),
			],
			actions: [
				s.billing.attach({ productId: planFree.id }),
				s.billing.attach({ productId: planPro.id }),
				s.billing.attach({ productId: planFree.id, customerId: freeOnly }),
				s.billing.attach({ productId: planPro.id, customerId: proOnly }),
				s.billing.attach({ productId: planOther.id, customerId: other }),
			],
		});

		const andFilter = CustomerFilterSchema.parse({
			$and: [
				{ plan: { plan_id: planFree.id } },
				{ plan: { plan_id: planPro.id } },
			],
		});
		const orFilter = CustomerFilterSchema.parse({
			$or: [
				{ plan: { plan_id: planFree.id } },
				{ plan: { plan_id: planPro.id } },
			],
		});

		expect(await countCustomers({ ctx, filter: andFilter, search: pfx })).toBe(
			1,
		);
		const andIds = await collectIds(
			filterCustomers({ ctx, filter: andFilter, search: pfx }),
		);
		expect(andIds.has(both)).toBe(true);
		expect(andIds.has(freeOnly)).toBe(false);
		expect(andIds.has(proOnly)).toBe(false);
		expect(andIds.has(other)).toBe(false);

		expect(await countCustomers({ ctx, filter: orFilter, search: pfx })).toBe(
			3,
		);
		const orIds = await collectIds(
			filterCustomers({ ctx, filter: orFilter, search: pfx }),
		);
		expect(orIds.has(both)).toBe(true);
		expect(orIds.has(freeOnly)).toBe(true);
		expect(orIds.has(proOnly)).toBe(true);
		expect(orIds.has(other)).toBe(false);
	},
);
