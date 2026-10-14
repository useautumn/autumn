import { ApiVersion, type CustomerData, type ProductV2 } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import ctx from "./createTestContext.js";

export const initTestScenario = async ({
	customerId,
	products,
	attachProducts,
	customerOptions = {},
}: {
	customerId: string;
	products: ProductV2[];
	attachProducts?: string[];
	customerOptions?: {
		customerData?: CustomerData;
		attachPm?: "success" | "fail" | "authenticate";
		withDefault?: boolean;
		withTestClock?: boolean;
	};
}) => {
	const {
		customerData,
		attachPm,
		withDefault = false,
		withTestClock = true,
	} = customerOptions;

	const { testClockId, customer } = await initCustomerV3({
		ctx,
		customerId,
		customerData,
		attachPm,
		withTestClock,
		withDefault,
	});

	await initProductsV0({
		ctx,
		products,
		prefix: customerId,
	});

	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const autumnV2 = new AutumnInt({
		version: ApiVersion.V2_0,
		secretKey: ctx.orgSecretKey,
	});

	if (attachProducts && attachProducts.length > 0) {
		for (const productId of attachProducts) {
			const prefixedId = `${customerId}_${productId}`;
			await autumnV1.attach({
				customer_id: customerId,
				product_id: prefixedId,
			});
		}
	}

	return {
		customerId,
		products,
		autumnV1,
		autumnV2,
		testClockId,
		customer,
		ctx,
	};
};
