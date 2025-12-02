import type { AppEnv, Customer, Organization, ProcessorType } from "@autumn/shared";
import type { PaymentProvider } from "@autumn/shared/utils/paymentProviders/types.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { createPaymentProvider } from "../factory.js";

/**
 * Payment provider-aware customer utilities
 * 
 * These utilities abstract away payment provider details and provide
 * a unified interface for customer operations.
 */
export const createPaymentProviderCustomer = async ({
	db,
	org,
	env,
	customer,
	logger,
	provider,
	testClockId,
	metadata,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: Customer;
	logger: any;
	provider?: PaymentProvider;
	testClockId?: string;
	metadata?: Record<string, unknown>;
}): Promise<{ id: string; type: ProcessorType }> => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	const providerType = paymentProvider.getProviderType();

	const providerCustomer = await paymentProvider.customers.create({
		name: customer.name || undefined,
		email: customer.email || undefined,
		metadata: {
			...(metadata || {}),
			autumn_id: customer.id || null,
			autumn_internal_id: customer.internal_id,
		},
		testClockId,
	});

	await CusService.update({
		db,
		idOrInternalId: customer.internal_id,
		orgId: org.id,
		env,
		update: {
			processor: {
				id: providerCustomer.id,
				type: providerType,
			},
		},
	});

	return {
		id: providerCustomer.id,
		type: providerType,
	};
};

export const getPaymentProviderCustomer = async ({
	org,
	env,
	customerId,
	provider,
}: {
	org: Organization;
	env: AppEnv;
	customerId: string;
	provider?: PaymentProvider;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });
	return paymentProvider.customers.retrieve(customerId);
};

export const createPaymentProviderCustomerIfNotExists = async ({
	db,
	org,
	env,
	customer,
	logger,
	provider,
	testClockId,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	customer: Customer;
	logger: any;
	provider?: PaymentProvider;
	testClockId?: string;
}) => {
	const paymentProvider = provider || createPaymentProvider({ org, env });

	let createNew = false;
	if (!customer.processor || !customer.processor.id) {
		createNew = true;
	} else {
		try {
			const providerCustomer = await paymentProvider.customers.retrieve(
				customer.processor.id,
			);
			if (!providerCustomer || providerCustomer.deleted) {
				createNew = true;
			} else {
				return providerCustomer;
			}
		} catch (_error) {
			createNew = true;
		}
	}

	if (createNew) {
		logger.info(`Creating new payment provider customer for ${customer.id}`);
		const processor = await createPaymentProviderCustomer({
			db,
			org,
			env,
			customer,
			logger,
			provider,
			testClockId,
		});

		customer.processor = processor;
		return await paymentProvider.customers.retrieve(processor.id);
	}
};

