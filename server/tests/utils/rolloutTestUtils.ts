import { timeout } from "@tests/utils/genUtils.js";
import { getBalanceWorkerRolloutOverride } from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import {
	removeRolloutOrg,
	updateRolloutPercent,
} from "@/internal/misc/rollouts/rolloutConfigStore.js";
import {
	ACTIVE_ROLLOUT_ID,
	ROLLOUT_SETTLE_MS,
} from "@/internal/misc/rollouts/rolloutUtils.js";

/** The local server polls the config every second; the flip lands one settle window after the write. */
const LOCAL_POLL_MS = 1_000;
const SETTLE_MARGIN_MS = 1_000;

/**
 * Isolated test envs (`bun tw` µVMs) serve the balance-worker rollout from the base64
 * edge-config override (AUTUMN_EDGE_CONFIG_OVERRIDE_B64) instead of S3, since
 * there are no AWS creds. When that's set, the per-org rollout writes here are
 * served in-memory and don't propagate across processes, so they no-op (the
 * override already enables the rollout globally).
 */
const EDGE_CONFIG_OVERRIDDEN = Boolean(
	process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64,
);

/** The server routes by the config only when nothing forces the answer; the test process shares the env file. */
export const serverRoutesByRolloutConfig = (): boolean =>
	!EDGE_CONFIG_OVERRIDDEN && getBalanceWorkerRolloutOverride() === undefined;

/** Sets the org's balance-worker percent and waits until the server has flipped to it; a no-op when the override decides. */
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

/** Removes the org-level rollout override (cleanup after test). */
export const cleanupOrgRollout = async ({ orgId }: { orgId: string }) => {
	if (!serverRoutesByRolloutConfig()) return;
	await removeRolloutOrg({ rolloutId: ACTIVE_ROLLOUT_ID, orgId });
};
