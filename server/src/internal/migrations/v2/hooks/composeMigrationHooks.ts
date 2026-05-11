import type {
	AroundMigrateCustomerArgs,
	AroundMigrateCustomerRun,
} from "./aroundMigrateCustomer/index.js";
import type { MigrationHooks, MigrationPlugin } from "./types.js";

export const composeMigrationHooks = ({
	hooks,
	plugins = [],
}: {
	hooks?: MigrationHooks;
	plugins?: MigrationPlugin[];
}): MigrationHooks | undefined => {
	const entries = [...plugins.map((plugin) => plugin.hooks), hooks].filter(
		(entry): entry is MigrationHooks => Boolean(entry),
	);

	if (entries.length === 0) return undefined;

	return {
		aroundMigrateCustomer: async (args: AroundMigrateCustomerArgs) => {
			const run = entries.reduceRight<AroundMigrateCustomerRun>(
				(next, entry) => async () => {
					if (!entry.aroundMigrateCustomer) return next();
					return entry.aroundMigrateCustomer({ ...args, run: next });
				},
				args.run,
			);
			return run();
		},
	};
};
