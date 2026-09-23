import type { WorkerCustomer } from "@autumn/balance-engine";
import {
	ApiVersion,
	type Customer,
	type CustomerData,
	CustomerSchema,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { createCustomerWithDefaults } from "@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js";
import { linkStripeCustomer } from "@/internal/customers/actions/linkStripeCustomer.js";
import { customerDataToCustomerUpdates } from "@/internal/customers/actions/updateCustomerData.js";

/** What `run` hands back: its result, and the customer row it ran against. */
export type RunWithCustomer<Result> = {
	result: Result;
	customer: WorkerCustomer | Customer | null;
};

/** By code, not class: the balance worker's mapped error is a plain RecaseError with the same code. */
const isCustomerNotFound = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.CustomerNotFound;

/** Below API 2.1 check and track create a missing customer; from 2.1 a missing customer is a 404. */
export const apiVersionCreatesCustomer = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean => !ctx.apiVersion.gte(ApiVersion.V2_1);

/** Fill empty name/email, and create the Stripe customer on `create_in_stripe`; both write through the billing plan executor. */
const applyCustomerData = async ({
	ctx,
	customer,
	customerData,
}: {
	ctx: AutumnContext;
	customer: WorkerCustomer | Customer;
	customerData: CustomerData;
}): Promise<void> => {
	const customerRow = CustomerSchema.parse(customer);
	const updates = customerDataToCustomerUpdates({
		ctx,
		customer: customerRow,
		customerData,
	});
	if (Object.keys(updates).length > 0)
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: customerRow.id ?? customerRow.internal_id,
				insertCustomerProducts: [],
				updateCustomer: { customer: customerRow, updates },
			},
		});
	const needsStripeCustomer =
		customerData.create_in_stripe && !customerRow.processor?.id;
	if (needsStripeCustomer)
		await linkStripeCustomer({ ctx, customer: { ...customerRow, ...updates } });
};

const runOrCreate = async <Result>({
	ctx,
	customerId,
	customerData,
	createEnabled,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	createEnabled: boolean;
	run: () => Promise<RunWithCustomer<Result>>;
}): Promise<RunWithCustomer<Result>> => {
	try {
		return await run();
	} catch (error) {
		if (!createEnabled || !isCustomerNotFound(error)) throw error;
	}
	await createCustomerWithDefaults({ ctx, customerId, customerData });
	return run();
};

/** The one place `customer_data` takes effect: run, create the customer on a miss, then apply it to the row `run` read. */
export const withCreateIfMissing = async <Result>({
	ctx,
	customerId,
	customerData,
	createEnabled = true,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	createEnabled?: boolean;
	run: () => Promise<RunWithCustomer<Result>>;
}): Promise<Result> => {
	const { result, customer } = await runOrCreate({
		ctx,
		customerId,
		customerData,
		createEnabled,
		run,
	});
	if (customerData && customer)
		await applyCustomerData({ ctx, customer, customerData });
	return result;
};
