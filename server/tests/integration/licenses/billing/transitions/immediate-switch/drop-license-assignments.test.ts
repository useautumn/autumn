// Red: dropping a shared link mutates historical and other-customer pools.
// Green: execution releases seats and restores only the exact outgoing pool.
import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	customerLicenses,
	customerProducts,
} from "@autumn/shared";
import {
	getLicenseDbState,
	listLicenseAssignments,
} from "@tests/integration/licenses/licenseTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("license switch: dropped licenses release assigned entities")}`,
	async () => {
		const customerId = "license-switch-release-dropped";
		const otherCustomerId = "license-switch-release-dropped-other";
		const group = "license-switch-release-dropped-group";
		const team = products.base({
			id: "license-switch-release-team",
			group,
			items: [items.dashboard()],
		});
		const pro = products.base({
			id: "license-switch-release-pro",
			group,
			items: [items.dashboard()],
		});
		const teamSuccessor = products.base({
			id: "license-switch-release-team-successor",
			group,
			items: [items.dashboard()],
		});
		const seat = products.base({
			id: "license-switch-release-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: otherCustomerId }]),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [team, teamSuccessor, pro, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: team.id,
					licenseProductId: seat.id,
					included: 2,
				}),
				s.licenses.link({
					parentProductId: teamSuccessor.id,
					licenseProductId: seat.id,
					included: 2,
				}),
				s.billing.attach({ productId: team.id }),
				...[0, 1].map((entityIndex) =>
					s.licenses.assign({
						licenseProductId: seat.id,
						entityIndex,
					}),
				),
			],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: teamSuccessor.id,
			plan_schedule: "immediate",
		});
		const beforeDrop = await getLicenseDbState({
			db: ctx.db,
			customerId,
		});
		const historicalProduct = beforeDrop.products.find(
			(customerProduct) => customerProduct.product_id === team.id,
		);
		const historicalPool = beforeDrop.pools.find(
			(pool) => pool.parent_customer_product_id === historicalProduct?.id,
		);
		expect(historicalPool?.remaining).toBe(0);
		const currentProduct = beforeDrop.products.find(
			(customerProduct) => customerProduct.product_id === teamSuccessor.id,
		);
		const currentPool = beforeDrop.pools.find(
			(pool) => pool.parent_customer_product_id === currentProduct?.id,
		);
		if (!currentPool) throw new Error("Current license pool not found");

		const otherEntityId = `${otherCustomerId}-entity`;
		await autumnV2_3.entities.create(otherCustomerId, {
			id: otherEntityId,
			feature_id: TestFeature.Users,
		});
		await autumnV2_3.billing.attach({
			customer_id: otherCustomerId,
			plan_id: teamSuccessor.id,
			plan_schedule: "immediate",
		});
		await autumnV2_3.licenses.attach({
			customer_id: otherCustomerId,
			plan_id: seat.id,
			entities: [{ entity_id: otherEntityId }],
		});
		const otherBefore = await getLicenseDbState({
			db: ctx.db,
			customerId: otherCustomerId,
		});
		await ctx.db
			.update(customerLicenses)
			.set({ link_id: currentPool.link_id })
			.where(eq(customerLicenses.id, otherBefore.pools[0].id));
		await ctx.db
			.update(customerProducts)
			.set({ customer_license_link_id: currentPool.link_id })
			.where(eq(customerProducts.id, otherBefore.assignments[0].id));

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
			plan_schedule: "immediate",
		};

		await autumnV2_3.billing.previewAttach(params);
		expect(
			await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				active: true,
			}),
		).toHaveLength(2);

		await autumnV2_3.billing.attach(params);
		expect(
			await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				active: true,
			}),
		).toHaveLength(0);
		const { assignments, pools } = await getLicenseDbState({
			db: ctx.db,
			customerId,
		});
		expect(
			assignments.every((assignment) => !assignment.internal_entity_id),
		).toBe(true);
		expect(assignments.every((assignment) => assignment.released_at)).toBe(
			true,
		);
		expect(
			pools.find((pool) => pool.id === historicalPool?.id)?.remaining,
		).toBe(0);
		const otherAfter = await getLicenseDbState({
			db: ctx.db,
			customerId: otherCustomerId,
		});
		expect(otherAfter.assignments[0].internal_entity_id).not.toBeNull();
		expect(otherAfter.pools[0].remaining).toBe(1);
	},
);
