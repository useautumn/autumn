import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerEntitlements,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getResetContextByIds } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";

test.concurrent(
	`${chalk.yellowBright("reset-cron: seat cusEnts inherit parent lifecycle in the sweep")}`,
	async () => {
		const customerId = "reset-seat-inheritance";
		const parent = products.base({
			id: "reset-inherit-parent",
			items: [items.monthlyPrice({ price: 10 }), items.dashboard()],
		});
		const devSeat = products.base({
			id: "reset-inherit-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
			group: "reset-inherit-licenses",
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: devSeat.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: [
				{
					entity_id: "reset-seat-entity",
					name: "Seat 1",
					feature_id: TestFeature.Users,
				},
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const parentCusProduct = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product.id === parent.id,
		);
		expect(parentCusProduct).toBeDefined();
		expect(parentCusProduct?.subscription_ids?.length).toBeGreaterThan(0);

		const [seatCusProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.internal_customer_id, fullCustomer.internal_id),
					isNotNull(customerProducts.customer_license_link_id),
					isNotNull(customerProducts.internal_entity_id),
				),
			);
		expect(seatCusProduct).toBeDefined();
		expect(seatCusProduct.subscription_ids ?? []).toEqual([]);

		const [seatCusEnt] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(
				and(
					eq(customerEntitlements.customer_product_id, seatCusProduct.id),
					isNotNull(customerEntitlements.next_reset_at),
				),
			);
		expect(seatCusEnt).toBeDefined();

		const activeHydration = await getResetContextByIds({
			db: ctx.db,
			customerEntitlementIds: [seatCusEnt.id],
		});
		const hydratedSeat = activeHydration.customerEntitlements.find(
			(row) => row.id === seatCusEnt.id,
		);
		expect(
			hydratedSeat,
			"seat cusEnt missing from hydration under active parent",
		).toBeDefined();
		expect(hydratedSeat?.customer_product?.status).toBe(
			CusProductStatus.Active,
		);
		expect(hydratedSeat?.customer_product?.subscription_ids).toEqual(
			parentCusProduct?.subscription_ids ?? [],
		);

		await CusProductService.update({
			ctx,
			cusProductId: parentCusProduct?.id ?? "",
			updates: { status: CusProductStatus.Expired },
		});

		const expiredHydration = await getResetContextByIds({
			db: ctx.db,
			customerEntitlementIds: [seatCusEnt.id],
		});
		const expiredSeat = expiredHydration.customerEntitlements.find(
			(row) => row.id === seatCusEnt.id,
		);
		expect(
			expiredSeat?.customer_product?.status ?? CusProductStatus.Expired,
		).toBe(CusProductStatus.Expired);

		const [seatAfter] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, seatCusProduct.id));
		expect(seatAfter.status).toBe(CusProductStatus.Active);
	},
);
