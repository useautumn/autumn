import type { Organization } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import { getBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addRolloutCustomersToWorker } from "@/internal/misc/rollouts/addRolloutCustomersToWorker.js";
import { resolveRolloutOrgId } from "@/internal/misc/rollouts/resolveRolloutOrgId.js";
import {
	getRolloutConfigFromSource,
	removeRolloutCustomers,
	removeRolloutOrg,
	updateRolloutPercent,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";
import {
	ACTIVE_ROLLOUT_ID,
	ROLLOUT_SETTLE_MS,
	resolveRolloutPercent,
	routingPercentAt,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const LOCAL_POLL_MS = 1_000;
const SETTLE_MARGIN_MS = 1_000;

const EDGE_CONFIG_OVERRIDDEN = Boolean(
	process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64,
);

export const serverRoutesByRolloutConfig = (): boolean =>
	!EDGE_CONFIG_OVERRIDDEN && getBalanceWorkerRolloutOverride() === undefined;

export const getServerBalanceWorkerRolloutPercent = async ({
	org,
}: {
	org: Pick<Organization, "id" | "is_sandbox" | "created_by">;
}): Promise<number> => {
	const override = getBalanceWorkerRolloutOverride();
	if (override !== undefined) return override ? 100 : 0;
	const rollout = resolveRolloutPercent({
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: resolveRolloutOrgId({ org }),
		config: await getRolloutConfigFromSource(),
	});
	return rollout ? routingPercentAt({ rollout, now: Date.now() }) : 0;
};

export const setOrgRolloutPercent = async ({
	orgId,
	percent,
}: {
	orgId: string;
	percent: number;
}) => {
	if (!serverRoutesByRolloutConfig()) return;
	await updateRolloutPercent({ rolloutId: ACTIVE_ROLLOUT_ID, orgId, percent });
	await timeout(ROLLOUT_SETTLE_MS + LOCAL_POLL_MS + SETTLE_MARGIN_MS);
};

export const setCustomerRolloutPinned = async ({
	ctx,
	customerId,
	pinned,
}: {
	ctx: AutumnContext;
	customerId: string;
	pinned: boolean;
}) => {
	if (!serverRoutesByRolloutConfig()) return;
	const params = {
		rolloutId: ACTIVE_ROLLOUT_ID,
		orgId: ctx.org.id,
		customerIds: [customerId],
	};
	if (pinned) await addRolloutCustomersToWorker({ ctx, ...params });
	else await removeRolloutCustomers(params);
	await timeout(ROLLOUT_SETTLE_MS + LOCAL_POLL_MS + SETTLE_MARGIN_MS);
};

export const cleanupOrgRollout = async ({ orgId }: { orgId: string }) => {
	if (!serverRoutesByRolloutConfig()) return;
	await removeRolloutOrg({ rolloutId: ACTIVE_ROLLOUT_ID, orgId });
};
