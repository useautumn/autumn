import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrateCustomerContext } from "../../operations/types/index.js";
import type {
	MigrateCustomerItemPreview,
	MigrateCustomerResult,
} from "../../run/migrateCustomer/index.js";

export type AroundMigrateCustomerRun = () => Promise<MigrateCustomerResult>;

export type AroundMigrateCustomerArgs = {
	ctx: AutumnContext;
	customerId: string;
	context: MigrateCustomerContext;
	preview: boolean;
	run: AroundMigrateCustomerRun;
};

export type AroundMigrateCustomerResult =
	| Promise<MigrateCustomerResult>
	| MigrateCustomerResult;

export type AroundMigrateCustomerSkip = {
	reason: string;
	response?: Record<string, unknown> | null;
	itemPreview?: MigrateCustomerItemPreview | null;
};

export const buildSkippedMigrateCustomerResult = ({
	context,
	skip,
}: {
	context: MigrateCustomerContext;
	skip: AroundMigrateCustomerSkip;
}): MigrateCustomerResult => ({
	itemPreview: skip.itemPreview ?? {
		id: context.fullCustomer.id ?? null,
		name: context.fullCustomer.name ?? null,
		email: context.fullCustomer.email ?? null,
	},
	status: "skipped",
	response: {
		skipped: {
			reason: skip.reason,
		},
		...(skip.response ?? {}),
	},
});
