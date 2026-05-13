import type {
	AroundMigrateCustomerArgs,
	AroundMigrateCustomerResult,
} from "./aroundMigrateCustomer/index.js";

export type MigrationHooks = {
	aroundMigrateCustomer?: (
		args: AroundMigrateCustomerArgs,
	) => AroundMigrateCustomerResult;
};

export type MigrationPlugin = {
	id: string;
	hooks?: MigrationHooks;
};
