import { expect, test } from "bun:test";
import { type CheckResponseV3, CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { listLicensePools } from "./licenseTestUtils.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "entity-del-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses entity deletion: ends assignment and expires provisioned product")}`,
	async () => {
		const parent = products.base({
			id: "entity-del-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "license-entity-deletion",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
					s.billing.attach({ productId: parent.id }),
					s.licenses.assign({
						licenseProductId: license.id,
						entityIndex: 0,
					}),
				],
			});

		const entityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(entityCheck.allowed).toBe(true);

		const customerCheckBefore = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(customerCheckBefore.allowed).toBe(false);

		await autumnV1.entities.delete(customerId, entities[0].id);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const activeLicenseProducts = fullCustomer.customer_products.filter(
			(customerProduct) =>
				customerProduct.product.id === license.id &&
				customerProduct.status === CusProductStatus.Active,
		);
		expect(activeLicenseProducts).toHaveLength(0);

		const customerCheckAfter = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(customerCheckAfter.allowed).toBe(false);

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			usage: 0,
			remaining: 1,
		});

		const { assignment: reassigned } = (await autumnV2_2.post(
			"/licenses.attach",
			{
				customer_id: customerId,
				entity_id: entities[1].id,
				plan_id: license.id,
			},
		)) as { assignment: { entity_id: string; ended_at: number | null } };
		expect(reassigned).toMatchObject({
			entity_id: entities[1].id,
			ended_at: null,
		});
	},
);
