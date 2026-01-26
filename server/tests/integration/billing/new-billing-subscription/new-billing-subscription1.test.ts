import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ApiVersion,
	BillingInterval,
	CusExpand,
	getCusStripeSubCount,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const paidAddOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructPriceItem({
			price: 10,
			interval: BillingInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase = "new-billing-subscription1";

describe(`${chalk.yellowBright("new-billing-subscription: paid product with add on mid cycle. add on should create new sub")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, paidAddOn],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: result.testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 20,
		});
	});

	test("should attach add on and have correct sub", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: paidAddOn.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({
			fullCus,
		});

		expect(subCount).toBe(2);

		const customer = await autumnV1.customers.get(customerId);

		expectProductAttached({
			customer: customer,
			product: paidAddOn,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(10);
	});

	test("should attach add on again and have 3 subscriptions", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: paidAddOn.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({
			fullCus,
		});

		expect(subCount).toBe(3);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const addOnProduct = customer.products.find((p) => p.id === paidAddOn.id);
		expect(addOnProduct?.quantity).toBe(2);

		const invoices = customer.invoices;
		expect(invoices?.length).toBe(3);
		expect(invoices?.[0].total).toBe(10);
	});
});

const premium2 = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

const pro2 = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase2 = "new-billing-subscription2";

describe(`${chalk.yellowBright("new-billing-subscription: entities with new_billing_sub (max 3 subs)")}`, () => {
	const customerId = testCase2;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entities = [
		{ id: "entity1", name: "Entity 1", feature_id: TestFeature.Users },
		{ id: "entity2", name: "Entity 2", feature_id: TestFeature.Users },
	];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro2, premium2],
			prefix: testCase2,
		});

		await autumnV1.entities.create(customerId, entities);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro2.id,
		});
	});

	test("should attach premium to entity1 with new_billing_subscription", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			product_id: premium2.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(2);

		const entity = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity,
			product: premium2,
		});
	});

	test("should attach premium to entity2 with new_billing_subscription", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entities[1].id,
			product_id: premium2.id,
			new_billing_subscription: true,
		});

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(3);

		const entity = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity,
			product: premium2,
		});
	});

	test("should have correct state: customer pro + 2 entity premiums", async () => {
		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			withSubs: true,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(3);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			expand: [CusExpand.Invoices],
		});

		const customerPro = customer.products.find((p) => p.id === pro2.id);
		expect(customerPro).toBeDefined();
		expect(customerPro?.status).toBe("active");

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		const entity1Premium = entity1.products!.find(
			(p: any) => p.id === premium2.id,
		);
		expect(entity1Premium).toBeDefined();
		expect(entity1Premium!.status).toBe("active");

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		const entity2Premium = entity2.products!.find(
			(p: any) => p.id === premium2.id,
		);
		expect(entity2Premium).toBeDefined();
		expect(entity2Premium!.status).toBe("active");

		console.log(
			`customer invoices: ${JSON.stringify(customer.invoices, null, 2)}`,
		);
	});
});

const premium3 = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});

const pro3 = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase3 = "new-billing-subscription3";

describe(`${chalk.yellowBright("new-billing-subscription: customer upgrade with entity on separate sub")}`, () => {
	const customerId = testCase3;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	const entity1 = {
		id: "entity1",
		name: "Entity 1",
		feature_id: TestFeature.Users,
	};

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro3, premium3],
			prefix: testCase3,
		});

		await autumnV1.entities.create(customerId, [entity1]);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro3.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entity1.id,
			product_id: premium3.id,
			new_billing_subscription: true,
		});
	});

	test("should have customer pro + entity premium (2 subs)", async () => {
		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(2);

		const customer = await autumnV1.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro3,
		});

		const entity = await autumnV1.entities.get(customerId, entity1.id);
		expectProductAttached({
			customer: entity,
			product: premium3,
		});
	});

	test("should upgrade main customer from pro to premium without affecting entity sub", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium3.id,
		});

		const customer = await autumnV1.customers.get(customerId);

		expectProductAttached({
			customer,
			product: premium3,
		});

		const proProduct = customer.products.find(
			(p) => p.id === pro3.id && !p.entity_id,
		);
		expect(proProduct).toBeUndefined();

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(2);
	});

	test("should have correct final state: customer premium + entity premium on separate subs", async () => {
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const customerPremium = customer.products.find(
			(p) => p.id === premium3.id && !p.entity_id,
		);
		expect(customerPremium).toBeDefined();
		expect(customerPremium?.status).toBe("active");

		const entity = await autumnV1.entities.get(customerId, entity1.id);
		const entityProducts = entity.products!;
		expect(entityProducts.length).toBe(1);

		const entityPremium = entityProducts.find((p: any) => p.id === premium3.id);
		expect(entityPremium).toBeDefined();
		expect(entityPremium!.status).toBe("active");

		const fullCus = await CusService.getFull({
			idOrInternalId: customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			withSubs: true,
		});

		const subCount = getCusStripeSubCount({ fullCus });
		expect(subCount).toBe(2);

		const invoices = customer.invoices;
		expect(invoices).toBeDefined();
		expect(invoices!.length).toBeGreaterThanOrEqual(1);
	});
});
