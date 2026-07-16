/**
 * FullProduct.parent_plan_licenses: reverse catalog-link hydration — a
 * license product carries its parent links (product = the parent plan),
 * on both ProductService.getFull and listFull.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("catalog: license product hydrates parent_plan_licenses both directions")}`,
	async () => {
		const parent = products.base({
			id: "ppl-hydration-parent",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "ppl-hydration-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
			group: "ppl-hydration-licenses",
		});

		const { ctx } = await initScenario({
			customerId: "ppl-hydration",
			setup: [s.customer({ testClock: false }), s.products({ list: [parent, devSeat] })],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: devSeat.id,
					included: 2,
				}),
			],
		});

		// getFull: license side carries the parent link
		const seatFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: devSeat.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(seatFull.parent_plan_licenses).toHaveLength(1);
		expect(seatFull.parent_plan_licenses?.[0]).toMatchObject({ included: 2 });
		expect(seatFull.parent_plan_licenses?.[0]?.product.id).toBe(parent.id);

		// parent side unchanged; non-license products carry no parent links
		const parentFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentFull.licenses?.[0]?.product.id).toBe(devSeat.id);
		expect(parentFull.parent_plan_licenses ?? []).toEqual([]);

		// listFull: same hydration
		const list = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			returnAll: true,
		});
		const seatInList = list.find((product) => product.id === devSeat.id);
		expect(seatInList?.parent_plan_licenses?.[0]?.product.id).toBe(parent.id);
	},
);
