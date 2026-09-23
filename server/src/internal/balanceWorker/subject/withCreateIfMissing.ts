import type { WorkerCustomer } from "@autumn/balance-engine";
import {
	ApiVersion,
	type Customer,
	type CustomerData,
	CustomerSchema,
	type EntityData,
	EntityErrorCode,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { createCustomerWithDefaults } from "@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js";
import { linkStripeCustomer } from "@/internal/customers/actions/linkStripeCustomer.js";
import { customerDataToCustomerUpdates } from "@/internal/customers/actions/updateCustomerData.js";
import { createEntitiesV2 } from "@/internal/entities/actions/createEntitiesV2/createEntitiesV2.js";

/** What `run` hands back: its result, and the customer row it ran against. */
export type RunWithCustomer<Result> = {
	result: Result;
	customer: WorkerCustomer | Customer | null;
};

/** By code, not class: the balance worker's mapped errors are plain RecaseErrors with the same codes. */
const hasErrorCode = (error: unknown, code: string): boolean =>
	error instanceof RecaseError && error.code === code;

/** Auto-creation never charges: a paid feature is refused, as legacy `autoCreateEntity` did. */
const createMissingEntity = async ({
	ctx,
	customerId,
	entityId,
	entityData,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	entityData?: EntityData;
}): Promise<void> => {
	if (!entityData?.feature_id)
		throw new RecaseError({
			message: `Entity with id ${entityId} not found. To automatically create this entity, please pass in 'feature_id' into the 'entity_data' field of the request body.`,
			code: ErrCode.InvalidInputs,
			statusCode: 400,
		});
	try {
		await createEntitiesV2({
			ctx,
			params: {
				customerId,
				entities: [
					{
						id: entityId,
						name: entityData.name ?? null,
						feature_id: entityData.feature_id,
						billing_controls: entityData.billing_controls,
					},
				],
				allowPaidFeatures: false,
			},
		});
	} catch (error) {
		// A concurrent request created it first; the re-run reads it.
		if (!hasErrorCode(error, EntityErrorCode.EntityAlreadyExists)) throw error;
	}
};

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

/** A missing customer implies its entity is missing too, so one miss says everything a run needs created. */
const createMissing = async ({
	ctx,
	error,
	customerId,
	customerData,
	entityId,
	entityData,
}: {
	ctx: AutumnContext;
	error: unknown;
	customerId: string;
	customerData?: CustomerData;
	entityId?: string | null;
	entityData?: EntityData;
}): Promise<void> => {
	const customerMissing = hasErrorCode(error, ErrCode.CustomerNotFound);
	const entityMissing =
		customerMissing || hasErrorCode(error, EntityErrorCode.EntityNotFound);
	if (!entityMissing) throw error;

	if (customerMissing)
		await createCustomerWithDefaults({ ctx, customerId, customerData });
	if (entityId)
		await createMissingEntity({ ctx, customerId, entityId, entityData });
};

const runOrCreate = async <Result>({
	ctx,
	customerId,
	customerData,
	entityId,
	entityData,
	createEnabled,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	entityId?: string | null;
	entityData?: EntityData;
	createEnabled: boolean;
	run: () => Promise<RunWithCustomer<Result>>;
}): Promise<RunWithCustomer<Result>> => {
	try {
		return await run();
	} catch (error) {
		if (!createEnabled) throw error;
		await createMissing({
			ctx,
			error,
			customerId,
			customerData,
			entityId,
			entityData,
		});
	}
	return run();
};

/** The one place `customer_data` and `entity_data` take effect: run, create what a miss names, then apply `customer_data` to the row `run` read. */
export const withCreateIfMissing = async <Result>({
	ctx,
	customerId,
	customerData,
	entityId,
	entityData,
	createEnabled = true,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	entityId?: string | null;
	entityData?: EntityData;
	createEnabled?: boolean;
	run: () => Promise<RunWithCustomer<Result>>;
}): Promise<Result> => {
	const { result, customer } = await runOrCreate({
		ctx,
		customerId,
		customerData,
		entityId,
		entityData,
		createEnabled,
		run,
	});
	if (customerData && customer)
		await applyCustomerData({ ctx, customer, customerData });
	return result;
};
