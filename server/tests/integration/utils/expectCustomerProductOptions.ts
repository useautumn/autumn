import { expect } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";

export const expectCustomerProductOptions = async ({
	ctx,
	customerId,
	productId,
	featureId,
	quantity,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	featureId: string;
	quantity: number;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === productId,
	);
	expect(cusProduct).toBeDefined();

	const featureOption = cusProduct?.options.find(
		(option) => option.feature_id === featureId,
	);
	expect(featureOption).toBeDefined();
	expect(featureOption?.quantity).toBe(quantity);
};
