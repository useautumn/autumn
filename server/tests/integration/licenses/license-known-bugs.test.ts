import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	customerLicenses,
	customerProducts,
	FreeTrialDuration,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { runProductCron } from "@/cron/productCron/runProductCron.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	assignLicense,
	getLicenseDbState,
	listLicensePools,
} from "./licenseTestUtils.js";

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

test.concurrent(
	`${chalk.yellowBright("licenses cleanup: deleting a customer cascades assignments and pools")}`,
	async () => {
		const parent = products.base({
			id: "delete-customer-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("delete-customer-license");
		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "license-delete-customer",
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
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});
		const customer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		await autumnV1.customers.delete(customerId);

		expect(
			await ctx.db.query.customerProducts.findMany({
				where: eq(customerProducts.internal_customer_id, customer.internal_id),
			}),
		).toHaveLength(0);
		expect(
			await ctx.db.query.customerLicenses.findMany({
				where: eq(customerLicenses.internal_customer_id, customer.internal_id),
			}),
		).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses lifecycle: trial revert reparents assignments and heals inventory")}`,
	async () => {
		const previous = products.pro({
			id: "revert-previous",
			items: [items.dashboard()],
		});
		const trial = products.premium({
			id: "revert-trial",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("revert-license");
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-trial-revert",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [previous, trial, license] }),
			],
			actions: [
				...[previous, trial].map((parent) =>
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
				),
				s.billing.attach({ productId: previous.id }),
			],
		});
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: trial.id,
			customize: {
				free_trial: {
					duration_length: 2,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
					on_end: "revert",
				},
			},
		});
		const assignment = await assignLicense({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			inStatuses: ALL_STATUSES,
		});
		const trialCustomerProduct = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product_id === trial.id,
		);
		if (!trialCustomerProduct) throw new Error("Trial product not found");
		await ctx.db
			.update(customerLicenses)
			.set({ remaining: 1 })
			.where(
				eq(
					customerLicenses.parent_customer_product_id,
					trialCustomerProduct.id,
				),
			);
		await CusProductService.update({
			ctx,
			cusProductId: trialCustomerProduct.id,
			updates: { trial_ends_at: Date.now() - 60_000 },
		});

		await runProductCron({ ctx: { db: ctx.db, logger: ctx.logger } });

		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		const activePrevious = dbState.products.find(
			(customerProduct) =>
				customerProduct.product_id === previous.id &&
				customerProduct.status === "active",
		);
		expect(activePrevious).toBeDefined();
		const assignmentRow = dbState.assignments.find(
			({ id }) => id === assignment.id,
		);
		expect(assignmentRow).toMatchObject({ status: "active" });
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({
			parent_customer_product_id: activePrevious?.id,
			granted: 1,
			remaining: 0,
		});
		// Assignments anchor to their pool via the plan-license link.
		expect(assignmentRow?.customer_license_link_id).toBe(
			dbState.pools[0].link_id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses status: a free-trial parent stored as active is assignable")}`,
	async () => {
		const parent = products.proWithTrial({
			id: "bug-status-parent",
			items: [items.dashboard()],
			trialDays: 7,
		});
		const license = makeLicenseProduct("bug-status-license");

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-bug-status",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		expect(
			fullCustomer.customer_products.find(
				(customerProduct) => customerProduct.product_id === parent.id,
			)?.status,
		).toBe(CusProductStatus.Active);

		const pools = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(pools).toHaveLength(1);
		expect(pools[0]).toMatchObject({
			license_plan_id: license.id,
			granted: 1,
			usage: 0,
			remaining: 1,
		});

		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			plan_id: license.id,
			entities: [{ entity_id: entities[0].id }],
		});

		const poolsAfter = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(poolsAfter[0]).toMatchObject({
			granted: 1,
			usage: 1,
			remaining: 0,
		});
	},
);
