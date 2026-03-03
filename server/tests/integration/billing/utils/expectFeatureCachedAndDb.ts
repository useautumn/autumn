import type { ApiCustomerV3 } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectCustomerFeatureCorrect } from "./expectCustomerFeatureCorrect.js";

/** Fetches the customer from cache and from DB, asserts feature balance + usage match on both. */
export const expectFeatureCachedAndDb = async ({
	autumn,
	customerId,
	featureId,
	balance,
	usage,
}: {
	autumn: AutumnInt;
	customerId: string;
	featureId: string;
	balance: number;
	usage: number;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV3>(customerId);

	// console.log("customer", JSON.stringify(customer, null, 2));

	expectCustomerFeatureCorrect({
		customer,
		featureId,
		balance,
		usage,
	});

	const customerDb = await autumn.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expectCustomerFeatureCorrect({
		customer: customerDb,
		featureId,
		balance,
		usage,
	});
};
