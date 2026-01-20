import type { Customer, CustomerData, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * Build a Customer object ready for insertion.
 */
export const initCustomer = ({
	ctx,
	customerId,
	customerData,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): Customer => {
	const { org, env } = ctx;
	const internalId = generateId("cus");

	return {
		internal_id: internalId,
		id: customerId,
		org_id: org.id,
		env,
		name: customerData?.name || "",
		email: customerData?.email || "",
		fingerprint: customerData?.fingerprint,
		metadata: customerData?.metadata ?? {},
		created_at: Date.now(),
		processor: customerData?.stripe_id
			? {
					id: customerData.stripe_id,
					type: "stripe",
				}
			: null,
	};
};

export const initFullCustomer = ({
	ctx,
	customerId,
	customerData,
}: {
	ctx: AutumnContext;
	customerId: string | null;
	customerData?: CustomerData;
}): FullCustomer => {
	return {
		...initCustomer({ ctx, customerId, customerData }),
		customer_products: [],
		entities: [],
		extra_customer_entitlements: [],
	};
};
