import type {
	CreateCustomerInternalOptions,
	CreateEntityParams,
} from "@autumn/shared";

export type SeedEntityInput = {
	id: string;
	name: string;
	featureId: string;
	customerData?: CreateEntityParams["customer_data"];
};

export type SeedCustomerInput = {
	id: string;
	name: string;
	email: string;
	metadata?: Record<string, unknown>;
	entities: SeedEntityInput[];
	createInStripe?: boolean;
	internalOptions?: CreateCustomerInternalOptions;
	skipWebhooks?: boolean;
	attachPlanId?: string | null;
};
