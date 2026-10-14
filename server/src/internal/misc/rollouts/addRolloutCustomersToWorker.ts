import { AppEnv, organizations } from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/evictBalanceWorkerCustomer.js";
import { addRolloutCustomers } from "./rolloutConfigStore.js";

const findPinnedOrgIds = async ({
	ctx,
	orgId,
}: {
	ctx: AutumnContext;
	orgId: string;
}): Promise<string[]> => {
	const rows = await ctx.db
		.select({ id: organizations.id })
		.from(organizations)
		.where(
			or(
				eq(organizations.id, orgId),
				and(
					eq(organizations.created_by, orgId),
					eq(organizations.is_sandbox, true),
				),
			),
		);
	return rows.map(({ id }) => id);
};

const evictStaleWorkerCopies = async ({
	ctx,
	orgId,
	customerIds,
}: {
	ctx: AutumnContext;
	orgId: string;
	customerIds: string[];
}) => {
	const orgIds = await findPinnedOrgIds({ ctx, orgId });
	const evictions = orgIds.flatMap((pinnedOrgId) =>
		[AppEnv.Live, AppEnv.Sandbox].flatMap((env) =>
			customerIds.map((customerId) =>
				evictBalanceWorkerCustomer({
					ctx: { ...ctx, env, org: { ...ctx.org, id: pinnedOrgId } },
					customerId,
				}),
			),
		),
	);
	await Promise.all(evictions);
};

export const addRolloutCustomersToWorker = async ({
	ctx,
	rolloutId,
	orgId,
	customerIds,
}: {
	ctx: AutumnContext;
	rolloutId: string;
	orgId: string;
	customerIds: string[];
}) => {
	const config = await addRolloutCustomers({ rolloutId, orgId, customerIds });
	await evictStaleWorkerCopies({ ctx, orgId, customerIds });
	return config;
};
