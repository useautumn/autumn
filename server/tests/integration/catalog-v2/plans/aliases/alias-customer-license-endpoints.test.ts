/**
 * Ingress plan-id aliases on customer create, transfer, and license attach.
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import {
	listLicenseAssignments,
	listLicensePools,
} from "@tests/integration/licenses/licenseTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { deleteAliases, renamePlan } from "../utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("plan aliases customer: auto_enable_plan_id / transfer product_id")}`,
	async () => {
		const customerId = uniqueTestId("alias_cus");
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const freeOld = free.id;
		const freeNew = `${freeOld}_n`;
		const proOld = pro.id;
		const proNew = `${proOld}_n`;
		const planIds = [freeOld, freeNew, proOld, proNew];
		const createdId = uniqueTestId("alias_ae");

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({ autumn: autumnV2_3, fromId: freeOld, toId: freeNew });
			await renamePlan({ autumn: autumnV2_3, fromId: proOld, toId: proNew });

			await autumnV2_3.customers.create({
				id: createdId,
				auto_enable_plan_id: freeOld,
			});
			await expectCustomerProducts({
				customerId: createdId,
				autumn: autumnV2_3,
				active: [freeNew],
			});

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: proOld,
			});
			const check = await autumnV2_3.check({
				customer_id: customerId,
				product_id: proOld,
			});
			expect(check.allowed).toBe(true);

			await autumnV2_3.transfer(customerId, {
				to_entity_id: entities[0].id,
				product_id: proOld,
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [proNew],
			});
		} finally {
			await autumnV2_3.customers.delete(createdId).catch(() => {});
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan aliases licenses: attach plan_id / license_quantities / upsert_licenses")}`,
	async () => {
		const customerId = uniqueTestId("alias_lic");
		const parent = products.base({
			id: "parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});

		const parentOld = parent.id;
		const parentNew = `${parentOld}_n`;
		const licenseOld = license.id;
		const licenseNew = `${licenseOld}_n`;
		const planIds = [parentOld, parentNew, licenseOld, licenseNew];

		await deleteAliases({ ctx, planIds });
		try {
			await renamePlan({
				autumn: autumnV2_3,
				fromId: parentOld,
				toId: parentNew,
			});
			await renamePlan({
				autumn: autumnV2_3,
				fromId: licenseOld,
				toId: licenseNew,
			});

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: parentOld,
				license_quantities: [{ license_plan_id: licenseOld, quantity: 2 }],
			});

			const pools = await listLicensePools({
				autumn: autumnV2_3,
				customerId,
			});
			expect(pools[0]).toMatchObject({
				license_plan_id: licenseNew,
				granted: 2,
			});

			await autumnV2_3.licenses.attach({
				customer_id: customerId,
				plan_id: licenseOld,
				entities: [{ entity_id: entities[0].id }],
			});
			const assignments = await listLicenseAssignments({
				autumn: autumnV2_3,
				customerId,
				licensePlanId: licenseOld,
				active: true,
			});
			expect(assignments).toHaveLength(1);
			expect(assignments[0].license_plan_id).toBe(licenseNew);

			await autumnV2_3.licenses.release({
				customer_id: customerId,
				license_plan_id: licenseOld,
				entity_ids: [entities[0].id],
			});

			await autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: parentOld,
				customize: {
					upsert_licenses: [{ license_plan_id: licenseOld, included: 3 }],
				},
			});
			const poolsAfter = await listLicensePools({
				autumn: autumnV2_3,
				customerId,
			});
			expect(
				poolsAfter.some((pool) => pool.license_plan_id === licenseNew),
			).toBe(true);
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
