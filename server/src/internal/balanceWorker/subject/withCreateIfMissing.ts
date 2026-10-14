import type { WorkerCustomer } from "@autumn/balance-engine";
import {
	ApiVersion,
	type BillingDetailsParams,
	type Customer,
	type CustomerData,
	CustomerSchema,
	type EntityData,
	EntityErrorCode,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { updateStripeBillingDetails } from "@/external/stripe/customers/billingDetails/operations/updateStripeBillingDetails.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js";
import { createCustomerWithDefaults } from "@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js";
import { linkStripeCustomer } from "@/internal/customers/actions/linkStripeCustomer.js";
import { customerDataToCustomerUpdates } from "@/internal/customers/actions/updateCustomerData.js";
import { createEntitiesV2 } from "@/internal/entities/actions/createEntitiesV2/createEntitiesV2.js";

export type RunWithCustomer<Result> = {
	result: Result;
	customer: WorkerCustomer | Customer | null;
};

const hasErrorCode = (error: unknown, code: string): boolean =>
	error instanceof RecaseError && error.code === code;

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
		if (!hasErrorCode(error, EntityErrorCode.EntityAlreadyExists)) throw error;
	}
};

export const apiVersionCreatesCustomer = ({
	ctx,
}: {
	ctx: AutumnContext;
}): boolean => !ctx.apiVersion.gte(ApiVersion.V2_1);

const applyCustomerData = async ({
	ctx,
	customer,
	customerData,
	billingDetails,
}: {
	ctx: AutumnContext;
	customer: WorkerCustomer | Customer;
	customerData?: CustomerData;
	billingDetails?: BillingDetailsParams;
}): Promise<void> => {
	const customerRow = CustomerSchema.parse(customer);
	const updates = customerData
		? customerDataToCustomerUpdates({
				ctx,
				customer: customerRow,
				customerData,
			})
		: {};
	if (Object.keys(updates).length > 0)
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: customerRow.id ?? customerRow.internal_id,
				insertCustomerProducts: [],
				updateCustomer: { customer: customerRow, updates },
			},
		});
	Object.assign(customer, updates);

	const needsStripeCustomer =
		customerData?.create_in_stripe || billingDetails !== undefined;
	if (!needsStripeCustomer) return;

	const updatedRow = { ...customerRow, ...updates };
	const stripeCustomerId =
		updatedRow.processor?.id ??
		(await linkStripeCustomer({ ctx, customer: updatedRow }))?.id;
	Object.assign(customer, { processor: updatedRow.processor });
	if (billingDetails && stripeCustomerId)
		await updateStripeBillingDetails({ ctx, stripeCustomerId, billingDetails });
};

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

export const withCreateIfMissing = async <Result>({
	ctx,
	customerId,
	customerData,
	billingDetails,
	entityId,
	entityData,
	createEnabled = true,
	run,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	billingDetails?: BillingDetailsParams;
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
	if ((customerData || billingDetails) && customer)
		await applyCustomerData({ ctx, customer, customerData, billingDetails });
	return result;
};
