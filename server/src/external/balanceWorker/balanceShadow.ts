import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { getBalanceWorkerClientEnv } from "@autumn/env/balanceWorkerClient";
import { ADMIN_BALANCE_SHADOW_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { BalanceShadowEdgeConfigSchema } from "@/internal/balances/shadow/balanceShadowEdgeConfig.js";
import { createBalanceShadowController } from "@/internal/balances/shadow/createBalanceShadowController.js";
import { startBalanceShadowSession } from "@/internal/balances/shadow/startBalanceShadowSession.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { createServerOwnershipConsumer } from "./getOwnershipConsumer.js";

const store = createEdgeConfigStore({
	s3Key: ADMIN_BALANCE_SHADOW_CONFIG_KEY,
	schema: BalanceShadowEdgeConfigSchema,
	defaultValue: () => ({ enabled: false as const }),
});

const controller = createBalanceShadowController({
	readConfig: store.get,
	runtimeEnv: process.env,
	startSession: ({ config }) => {
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
		return startBalanceShadowSession({
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
	},
	report: (error) => {
		logger.warn(
			{ error, component: "balance-shadow", event: "configuration_failed" },
			"[balance-shadow] Disabled; live routing unchanged",
		);
	},
});

registerEdgeConfig({
	store: {
		refresh: async (options) => {
			await store.refresh(options);
			await controller.refresh();
		},
	},
});

export const startBalanceShadow = controller.start;
export const getBalanceShadowSession = controller.getSession;
export const stopBalanceShadow = controller.stop;
