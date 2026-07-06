/**
 * TDD test for entity deletion leaving license state inconsistent.
 *
 * Red-failure mode (current behavior):
 *  - Deleting an entity cascade-deletes its license assignment, but the
 *    provisioned license cusProduct survives with internal_entity_id SET NULL,
 *    staying Active as a customer-level product — its license feature grants
 *    leak into customer-level check/balances.
 *
 * Green-success criteria (after fix):
 *  - Entity deletion ends the entity's assignments and expires their
 *    provisioned customer products; license features stay invisible at the
 *    customer level, and the freed slot is re-assignable to another entity.
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	type LicensePoolResponse,
	ProductCatalogType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "entity-del-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
	catalog_type: ProductCatalogType.License,
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
				actions: [s.billing.attach({ productId: parent.id })],
			});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 1,
		});

		await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
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

		const pools = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
		})) as { list: LicensePoolResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0].inventory).toMatchObject({
			assigned: 0,
			available: 1,
		});

		const { assignment: reassigned } = (await autumnV2_2.post(
			"/licenses.assign",
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
