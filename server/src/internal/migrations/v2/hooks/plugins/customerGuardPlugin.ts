import {
	type AroundMigrateCustomerArgs,
	buildSkippedMigrateCustomerResult,
} from "../aroundMigrateCustomer/index.js";
import type { MigrationPlugin } from "../types.js";

export type CustomerGuardResult =
	| undefined
	| null
	| {
			reason: string;
			response?: Record<string, unknown> | null;
	  };

export const customerGuardPlugin = ({
	id,
	guard,
}: {
	id: string;
	guard: (
		args: AroundMigrateCustomerArgs,
	) => Promise<CustomerGuardResult> | CustomerGuardResult;
}): MigrationPlugin => ({
	id,
	hooks: {
		aroundMigrateCustomer: async (args) => {
			const result = await guard(args);
			if (!result) return args.run();

			return buildSkippedMigrateCustomerResult({
				context: args.context,
				skip: {
					reason: result.reason,
					response: {
						guard: {
							pluginId: id,
							reason: result.reason,
							...(result.response ?? {}),
						},
					},
				},
			});
		},
	},
});
