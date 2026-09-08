import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import { logger } from "@/external/logtail/logtailUtils.js";
import { parseBalanceShadowConfig } from "@/internal/balances/shadow/parseBalanceShadowConfig.js";
import type { BalanceShadowSession } from "@/internal/balances/shadow/runWithBalanceShadow.js";
import { startBalanceShadowSession } from "@/internal/balances/shadow/startBalanceShadowSession.js";
import { createServerOwnershipConsumer } from "./getOwnershipConsumer.js";

let session: ReturnType<typeof startBalanceShadowSession> | undefined;
let started = false;

export function startBalanceShadow(): void {
	if (started) return;
	started = true;
	try {
		const config = parseBalanceShadowConfig({ runtimeEnv: process.env });
		if (!config) return;
		const env = getBalanceWorkerClientEnv();
		const owners = createServerOwnershipConsumer({
			topic: config.ownershipTopic,
			groupIdPrefix: "autumn-server-shadow",
		});
		const client = createBalanceWorkerClient({
			ctx: { owners },
			config: {
				partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
				timeoutMs: env.BALANCE_WORKER_REQUEST_TIMEOUT_MS,
			},
		});
		const observerId = crypto.randomUUID();
		session = startBalanceShadowSession({
			config,
			dependencies: {
				owners,
				client,
				report: (event) =>
					logger.info(
						{
							...event,
							component: "balance-shadow",
							runId: config.runId,
							observerId,
							processId: process.pid,
						},
						"[balance-shadow]",
					),
			},
		});
	} catch (error) {
		logger.warn(
			{ error, component: "balance-shadow", event: "disabled_invalid_config" },
			"[balance-shadow] Disabled; live routing unchanged",
		);
	}
}

export function getBalanceShadowSession(): BalanceShadowSession | undefined {
	return session;
}

export async function stopBalanceShadow(): Promise<void> {
	await session?.stop();
}
