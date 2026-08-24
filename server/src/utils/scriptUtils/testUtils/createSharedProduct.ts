import {
	ApiVersion,
	customerProducts,
	customers,
	type ProductV2,
	products as productsTable,
} from "@autumn/shared";
import { createProducts } from "@tests/utils/productUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq, inArray } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { deleteCachedFullCustomer } from "../../../internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

export const createSharedProducts = async ({
	products,
	ctx,
}: {
	products: ProductV2[];
	ctx: TestContext;
}) => {
	const { db } = ctx;

	const productRows = await ctx.db.query.products.findMany({
		where: and(
			inArray(
				productsTable.id,
				products.map((p) => p.id),
			),
			eq(productsTable.org_id, ctx.org.id),
			eq(productsTable.env, ctx.env),
		),
	});

	const cusProducts =
		productRows.length > 0
			? await ctx.db.query.customerProducts.findMany({
					where: inArray(
						customerProducts.internal_product_id,
						productRows.map((p) => p.internal_id),
					),
					with: {
						product: true,
					},
				})
			: [];

	if (cusProducts.length > 10) {
		throw new Error("Too many customers under shared default free product");
	}

	const deletedCustomers = await ctx.db
		.delete(customers)
		.where(
			and(
				inArray(
					customers.internal_id,
					cusProducts.map((cp) => cp.internal_customer_id),
				),
				eq(customers.env, ctx.env),
				eq(customers.org_id, ctx.org.id),
			),
		)
		.returning();
	const clearCache = [];
	for (const customer of deletedCustomers) {
		clearCache.push(
			deleteCachedFullCustomer({
				customerId: customer.id ?? "",
				ctx,
				source: "createSharedProducts",
			}),
		);
	}
	await Promise.all(clearCache);

	const autumn = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	try {
		await createProducts({
			db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn,
			products,
		});
	} catch (error) {
		console.error(
			"[createSharedProducts] Failed to create shared products:",
			error,
		);
		console.error(
			"Product IDs:",
			products.map((p) => p.id),
		);
		throw error;
	}
};
