import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	type LimitedItem,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

/**
 * Builds a fresh free product with a monthly-reset feature item. We construct
 * a new product object per describe block because `initProductsV0` mutates the
 * product id (prefixing it), and we want to isolate each test customer.
 *
 * `ignorePastDue` controls the product-level `config.ignore_past_due` flag —
 * this replaces the former customer-level `customers.ignore_past_due` column,
 * which no longer exists.
 */
const buildFreeProduct = ({
	ignorePastDue,
}: {
	ignorePastDue: boolean;
}): ProductV2 => {
	const item = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Month,
	}) as LimitedItem;

	const product = constructProduct({
		items: [item],
		type: "free",
		isDefault: false,
	}) as ProductV2;

	// The product-level `config.ignore_past_due` flag is what the cron reads
	// now (via `products.config->>'ignore_past_due'`). We attach it here so
	// it flows through `autumn.products.create` (CreateProductV2Params.config).
	product.config = { ignore_past_due: ignorePastDue };

	return product;
};

/**
 * Shared setup: creates a customer via initCustomerV3, registers a fresh free
 * product scoped to that customer with the requested product-level
 * `config.ignore_past_due`, attaches the product, then moves the resulting
 * customer_entitlement's next_reset_at into the past and patches the
 * customer_product status.
 *
 * NOTE: `ignore_past_due` is now a product-level flag set at product creation
 * time via the public API. There is no customer-level flag anymore.
 */
const setupPastDueScenario = async ({
	customerId,
	productStatus,
	ignorePastDue,
}: {
	customerId: string;
	productStatus: CusProductStatus;
	ignorePastDue: boolean;
}) => {
	const product = buildFreeProduct({ ignorePastDue });
	const autumn = new AutumnInt({ version: ApiVersion.V1_2 });

	// initProductsV0 → createProducts → autumn.products.create, which accepts
	// `config` on CreateProductV2Params. This persists the flag into
	// products.config without any direct SQL.
	await initProductsV0({
		ctx,
		products: [product],
		prefix: customerId,
		customerId,
	});

	await initCustomerV3({
		ctx,
		customerId,
		customerData: {},
		withTestClock: false,
	});

	await autumn.attach({
		customer_id: customerId,
		product_id: product.id,
	});

	// Grab the cusEnt that was just created via attach.
	const cusEnt = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(cusEnt).toBeDefined();
	expect(cusEnt?.customer_product_id).toBeDefined();

	// Force next_reset_at into the past so the cron query would normally pick
	// this row up.
	const pastTime = Date.now() - 1000;
	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTime })
		.where(eq(customerEntitlements.id, cusEnt!.id));

	// Patch the customer_products.status directly via Drizzle. `autumn.attach`
	// always produces an `active` row, and we don't have a public API to flip
	// it to `past_due`, so we update the row in place.
	await ctx.db
		.update(customerProducts)
		.set({ status: productStatus })
		.where(eq(customerProducts.id, cusEnt!.customer_product_id!));

	return cusEnt!;
};

describe(`${chalk.yellowBright("past-due-reset: past_due product WITHOUT ignore_past_due is skipped")}`, () => {
	const customerId = "past-due-reset-ignored";
	let cusEntId: string;

	beforeAll(async () => {
		const cusEnt = await setupPastDueScenario({
			customerId,
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: false,
		});
		cusEntId = cusEnt.id;
	});

	test("getActiveResetPassed should NOT return cusEnt for past_due product when product.config.ignore_past_due is false", async () => {
		const resetCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
		});

		const found = resetCusEnts.find((ce) => ce.id === cusEntId);
		expect(found).toBeUndefined();
	});
});

describe(`${chalk.yellowBright("past-due-reset: past_due product WITH ignore_past_due is included")}`, () => {
	const customerId = "past-due-reset-allowed";
	let cusEntId: string;

	beforeAll(async () => {
		const cusEnt = await setupPastDueScenario({
			customerId,
			productStatus: CusProductStatus.PastDue,
			ignorePastDue: true,
		});
		cusEntId = cusEnt.id;
	});

	test("getActiveResetPassed SHOULD return cusEnt for past_due product when product.config.ignore_past_due is true", async () => {
		const resetCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
		});

		const found = resetCusEnts.find((ce) => ce.id === cusEntId);
		expect(found).toBeDefined();
		expect(found?.customer.id).toBe(customerId);
	});
});

describe(`${chalk.yellowBright("past-due-reset: active product is always included (regression guard)")}`, () => {
	const customerId = "past-due-reset-active";
	let cusEntId: string;

	beforeAll(async () => {
		const cusEnt = await setupPastDueScenario({
			customerId,
			productStatus: CusProductStatus.Active,
			ignorePastDue: false,
		});
		cusEntId = cusEnt.id;
	});

	test("getActiveResetPassed SHOULD return cusEnt for active product regardless of product.config.ignore_past_due", async () => {
		const resetCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
		});

		const found = resetCusEnts.find((ce) => ce.id === cusEntId);
		expect(found).toBeDefined();
		expect(found?.customer.id).toBe(customerId);
	});
});
