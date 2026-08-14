/**
 * Red: early activation keeps a future starts_at. Green: starts_at becomes the activation time.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	ms,
	products,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { generateId } from "@/utils/genUtils";

test(`${chalk.yellowBright("activate scheduled: early activation replaces future starts_at")}`, async () => {
	const now = Date.now();
	const customerId = generateId("early_activation_customer");
	const internalCustomerId = generateId("cus");
	const productId = generateId("early_activation_plan");
	const internalProductId = generateId("prod");
	const customerProductId = generateId("cus_prod");
	const futureStartsAt = now + ms.days(30);

	await ctx.db.insert(customers).values({
		id: customerId,
		internal_id: internalCustomerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: now,
		processor: null,
	});
	await ctx.db.insert(products).values({
		id: productId,
		internal_id: internalProductId,
		org_id: ctx.org.id,
		env: ctx.env,
		name: "Early Activation Plan",
		created_at: now,
		is_default: true,
	});
	await ctx.db.insert(customerProducts).values({
		id: customerProductId,
		customer_id: customerId,
		internal_customer_id: internalCustomerId,
		product_id: productId,
		internal_product_id: internalProductId,
		created_at: now,
		updated_at: now,
		status: CusProductStatus.Scheduled,
		starts_at: futureStartsAt,
	});

	try {
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			expand: [],
		});
		const customerProduct = fullCustomer.customer_products[0]!;
		const activatedAt = Date.now();

		await customerProductActions.activateScheduled({
			ctx: { ...ctx, testOptions: { skipWebhooks: true } },
			customerProduct,
			fullCustomer,
			activatedAt,
		});

		const [activated] = await ctx.db
			.select({
				status: customerProducts.status,
				startsAt: customerProducts.starts_at,
			})
			.from(customerProducts)
			.where(eq(customerProducts.id, customerProductId));
		expect(activated?.status).toBe(CusProductStatus.Active);
		expect(activated?.startsAt).toBe(activatedAt);
	} finally {
		await ctx.db
			.delete(customers)
			.where(eq(customers.internal_id, internalCustomerId));
		await ctx.db
			.delete(products)
			.where(eq(products.internal_id, internalProductId));
	}
});
