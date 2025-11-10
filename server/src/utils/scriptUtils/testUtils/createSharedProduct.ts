import {
	ApiVersion,
	customerProducts,
	customers,
	type ProductV2,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";

import { createProducts } from "tests/utils/productUtils.js";
import type { TestContext } from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export const createSharedProducts = async ({
	products,
	ctx,
}: {
	products: ProductV2[];
	ctx: TestContext;
}) => {
	const { db } = ctx;

	let cusProducts = await ctx.db.query.customerProducts.findMany({
		where: inArray(
			customerProducts.product_id,
			products.map((p) => p.id),
		),
		with: {
			product: true,
		},
	});
	cusProducts = cusProducts.filter((cp) => cp.product.org_id === ctx.org.id);

	if (cusProducts.length > 10) {
		throw new Error("Too many customers under shared default free product");
	}

	await ctx.db.delete(customers).where(
		and(
			inArray(
				customers.internal_id,
				cusProducts.map((cp) => cp.internal_customer_id),
			),
			eq(customers.env, ctx.env),
			eq(customers.org_id, ctx.org.id),
		),
	);

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
