import {
	type Customer,
	CustomerAlreadyExistsError,
	CustomerNotFoundError,
	notNullish,
	ProcessorType,
	RecaseError,
	type UpdateCustomerParams,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const updateCustomer = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCustomerParams;
}) => {
	const { db, org, env, logger } = ctx;
	const { customer_id: customerId, ...newCusData } = params;

	const originalCustomer = await CusService.get({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
	});

	if (!originalCustomer) {
		throw new CustomerNotFoundError({ customerId });
	}

	if (newCusData.id === null) {
		throw new RecaseError({
			message: `Not allowed to update a customer's ID to null`,
		});
	}

	if (notNullish(newCusData.id) && originalCustomer.id !== newCusData.id) {
		// Fetch for existing customer
		const existingCustomer = await CusService.get({
			db,
			idOrInternalId: newCusData.id,
			orgId: org.id,
			env,
		});

		if (existingCustomer) {
			throw new CustomerAlreadyExistsError({
				message: `Customer with ID ${newCusData.id} already exists, can't change to this ID`,
				customerId: newCusData.id,
			});
		}
	}

	// Try to update stripe ID
	let stripeId = originalCustomer.processor?.id;
	const newStripeId = newCusData.stripe_id;

	if (notNullish(newStripeId) && stripeId !== newStripeId) {
		const stripeCli = createStripeCli({ org, env });
		await stripeCli.customers.retrieve(newStripeId);

		stripeId = newCusData.stripe_id;
		logger.info(
			`Updating customer's Stripe ID from ${originalCustomer.processor?.id} to ${stripeId}`,
		);
	}

	// Check if customer email is being changed
	const oldMetadata = originalCustomer.metadata || {};
	const newMetadata = newCusData.metadata || {};
	for (const key in newMetadata) {
		if (newMetadata[key] === null) {
			delete newMetadata[key];
			delete oldMetadata[key];
		}
	}

	const stripeUpdate: Stripe.CustomerUpdateParams = {
		email:
			originalCustomer.email !== newCusData.email &&
			notNullish(newCusData.email)
				? newCusData.email
				: undefined,
		name:
			originalCustomer.name !== newCusData.name && notNullish(newCusData.name)
				? newCusData.name
				: undefined,
	};

	if (Object.keys(stripeUpdate).length > 0 && stripeId) {
		const stripeCli = createStripeCli({ org, env });
		await stripeCli.customers.update(stripeId, stripeUpdate);
	}

	// Prepare update data
	const updateData: Partial<Customer> = {
		...newCusData,
		metadata: {
			...oldMetadata,
			...newMetadata,
		},
	};

	if (newStripeId) {
		// Only set processor if newStripeId is provided
		updateData.processor = { id: newStripeId, type: ProcessorType.Stripe };
	}

	if (!notNullish(newCusData.id) || originalCustomer.id === newCusData.id) {
		// Remove id from update if not changing
		delete updateData.id;
	}

	await CusService.update({
		db,
		idOrInternalId: originalCustomer.internal_id,
		orgId: org.id,
		env,
		update: updateData,
	});

	return newCusData.id ?? customerId;
};
