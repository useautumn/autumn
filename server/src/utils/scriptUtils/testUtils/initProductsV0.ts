import { ApiVersion, type ProductV2 } from "@autumn/shared";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { TestContext } from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export const initProductsV0 = async ({
	ctx,
	products,
	prefix,
}: {
	ctx: TestContext;
	products: ProductV2[];
	prefix?: string;
}) => {
	// 1. Add prefix to products
	if (prefix) {
		addPrefixToProducts({
			products,
			prefix,
		});
	}

	// 2. Create
	const autumn = new AutumnInt({ version: ApiVersion.V1_2 });
	await createProducts({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		autumn: autumn,
		products,
	});
};
