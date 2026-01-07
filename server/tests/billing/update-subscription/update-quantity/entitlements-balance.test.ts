import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

const billingUnits = 12;
const pricePerUnit = 8;

/**
 * Subscription Update - Entitlement Balance Tests
 *
 * These tests verify that subscription updates correctly update customer
 * entitlement balances at the database level. These are lower-level tests
 * that check internal state using CusService.getFull() to ensure the
 * balance increment/decrement logic works correctly.
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: increment entitlement balance on upgrade")}`,
	async () => {
		const customerId = "ent-balance-upgrade";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === product.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
			],
		});

		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === product.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// +5 units × 12 billing_units = +60 messages
		expect(afterBalance).toBe(beforeBalance + 60);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: decrement entitlement balance on downgrade")}`,
	async () => {
		const customerId = "ent-balance-downgrade";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
					],
				}),
			],
		});

		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === product.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		});

		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === product.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// -5 units × 12 billing_units = -60 messages
		expect(afterBalance).toBe(beforeBalance - 60);
	},
);
