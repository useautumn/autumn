import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import { customerEntitlementsRepo } from "@/internal/customers/cusProducts/cusEnts/repos/index.js";
import { createWorkerContext } from "@/queue/createWorkerContext.js";
import type {
	BatchResetContext,
	BatchResetCustomerEntitlementsV2Payload,
	BatchResetGroup,
} from "../types.js";

const orgEnvKey = ({ orgId, env }: { orgId: string; env: string }) =>
	`${orgId}:${env}`;

/**
 * Builds one worker context per unique org+env in the batch (each context
 * loads the org + features once). Orgs deleted since queueing are skipped.
 */
const fetchUniqueOrgContexts = async ({
	db,
	logger,
	customerEntitlements,
}: {
	db: DrizzleCli;
	logger: Logger;
	customerEntitlements: ResetContextCustomerEntitlement[];
}): Promise<Map<string, AutumnContext>> => {
	const uniqueOrgEnvs = new Map<string, { orgId: string; env: AppEnv }>();
	for (const customerEntitlement of customerEntitlements) {
		const { org_id: orgId, env } = customerEntitlement.customer;
		uniqueOrgEnvs.set(orgEnvKey({ orgId, env }), {
			orgId,
			env: env as AppEnv,
		});
	}

	const contexts = new Map<string, AutumnContext>();
	for (const [key, { orgId, env }] of uniqueOrgEnvs) {
		const ctx = await createWorkerContext({
			db,
			payload: { orgId, env },
			logger,
		});
		if (!ctx) {
			logger.warn(`[batchReset] org ${orgId} (${env}) not found, skipping`);
			continue;
		}
		contexts.set(key, ctx);
	}

	return contexts;
};

/**
 * Setup for a batch reset: hydrates the requested customer entitlements, then
 * groups them per org+env with one worker context per group.
 */
export const setupBatchResetContext = async ({
	db,
	logger,
	payload,
}: {
	db: DrizzleCli;
	logger: Logger;
	payload: BatchResetCustomerEntitlementsV2Payload;
}): Promise<BatchResetContext> => {
	const { customerEntitlements, missingIds } =
		await customerEntitlementsRepo.getResetContextByIds({
			db,
			customerEntitlementIds: payload.customerEntitlementIds,
		});

	const orgContexts = await fetchUniqueOrgContexts({
		db,
		logger,
		customerEntitlements,
	});

	const groupsByOrgEnv = new Map<string, BatchResetGroup>();
	for (const customerEntitlement of customerEntitlements) {
		const { org_id: orgId, env } = customerEntitlement.customer;
		const key = orgEnvKey({ orgId, env });

		const ctx = orgContexts.get(key);
		if (!ctx) continue;

		const group = groupsByOrgEnv.get(key) ?? {
			ctx,
			customerEntitlements: [],
		};
		group.customerEntitlements.push(customerEntitlement);
		groupsByOrgEnv.set(key, group);
	}

	return {
		groups: [...groupsByOrgEnv.values()],
		missingIds,
	};
};
