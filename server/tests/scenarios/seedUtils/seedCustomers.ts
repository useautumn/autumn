import {
	ApiVersion,
	type CreateEntityParams,
	type LegacyVersion,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { mapWithConcurrency } from "./concurrency";
import type { SeedCustomerInput } from "./customerSeedTypes";

export const createScenarioAutumn = ({
	ctx,
	version = ApiVersion.V1_2,
}: {
	ctx: TestContext;
	version?: string | LegacyVersion;
}) =>
	new AutumnInt({
		version,
		secretKey: ctx.orgSecretKey,
	});

export const seedCustomersWithEntities = async <
	TCustomer extends SeedCustomerInput,
>({
	autumn,
	customers,
	concurrency = 10,
	deleteExisting = true,
}: {
	autumn: AutumnInt;
	customers: TCustomer[];
	concurrency?: number;
	deleteExisting?: boolean;
}) => {
	const seededCustomers = await mapWithConcurrency({
		list: customers,
		concurrency,
		fn: async (customer) => {
			if (deleteExisting) {
				try {
					await autumn.customers.delete(customer.id);
				} catch {}
			}

			await autumn.customers.create({
				id: customer.id,
				name: customer.name,
				email: customer.email,
				metadata: customer.metadata,
				create_in_stripe: customer.createInStripe ?? false,
				internalOptions: customer.internalOptions ?? {
					disable_defaults: true,
				},
				skipWebhooks: customer.skipWebhooks ?? true,
			});

			if (customer.entities.length > 0) {
				const entityPayloads = customer.entities.map(
					(entity): CreateEntityParams => ({
						id: entity.id,
						name: entity.name,
						feature_id: entity.featureId,
						customer_data: entity.customerData,
					}),
				);

				await autumn.entities.create(customer.id, entityPayloads);
			}

			if (customer.attachPlanId) {
				await autumn.billing.attach(
					{
						customer_id: customer.id,
						product_id: customer.attachPlanId,
					},
					{ skipWebhooks: customer.skipWebhooks ?? true, timeout: 0 },
				);
			}

			return customer;
		},
	});

	return {
		customerCount: seededCustomers.length,
		entityCount: seededCustomers.reduce(
			(total, customer) => total + customer.entities.length,
			0,
		),
		customers: seededCustomers,
	};
};
