import { expect, mock, spyOn, test } from "bun:test";
import * as clientConfig from "@autumn/env/balanceWorkerClient";
import { ADMIN_BALANCE_SHADOW_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import * as s3 from "@/external/aws/s3/bunS3EdgeConfigClient.js";
import * as ownership from "@/external/balanceWorker/getOwnershipConsumer.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { BalanceShadowConfig } from "@/internal/balances/shadow/balanceShadowTypes.js";
import * as registry from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";

async function verifyEdgeWiring() {
	let body = JSON.stringify({ enabled: false });
	let failure: Error | undefined;
	const requests: string[] = [];
	spyOn(s3, "createBunS3EdgeConfigClient").mockReturnValue({
		send: async (command) => {
			requests.push(command.input.Key ?? "");
			if (failure) throw failure;
			return { Body: { transformToString: async () => body } };
		},
	});
	let registered:
		| Parameters<typeof registry.registerEdgeConfig>[0]["store"]
		| undefined;
	spyOn(registry, "registerEdgeConfig").mockImplementation(({ store }) => {
		registered = store;
	});
	const starts = mock(async () => {});
	const stops = mock(async () => {});
	spyOn(ownership, "createServerOwnershipConsumer").mockReturnValue({
		start: starts,
		stop: stops,
		refresh: async () => {},
		findOwner: () => undefined,
	});
	spyOn(clientConfig, "getBalanceWorkerClientEnv").mockReturnValue(
		clientConfig.createBalanceWorkerClientEnv({ KAFKA_AUTH_MODE: "none" }),
	);
	spyOn(logger, "info").mockImplementation(() => {});
	spyOn(logger, "warn").mockImplementation(() => {});
	const runtime = await import("@/external/balanceWorker/balanceShadow.js");
	try {
		expect(registered).toBeDefined();
		await registered!.refresh();
		runtime.startBalanceShadow();
		await registered!.refresh();
		expect(starts).not.toHaveBeenCalled();
		const run: BalanceShadowConfig = {
			runId: "edge-trial",
			ownershipTopic: "edge-trial.ownership",
			expiresAt: Date.now() + 60_000,
			customers: [
				{
					orgId: "org",
					env: "sandbox",
					customerId: "customer",
					featureId: "messages",
				},
			],
		};
		body = JSON.stringify({ enabled: true, run });
		await registered!.refresh();
		expect(runtime.getBalanceShadowSession()?.config).toEqual(run);
		expect(starts).toHaveBeenCalledTimes(1);
		await registered!.refresh();
		expect(starts).toHaveBeenCalledTimes(1);
		for (const reason of ["missing", "malformed", "unavailable"]) {
			if (reason === "malformed") body = "not-json";
			else {
				failure = new Error(reason);
				if (reason === "missing") failure.name = "NoSuchKey";
			}
			await registered!.refresh();
			expect(runtime.getBalanceShadowSession()).toBeUndefined();
			failure = undefined;
			body = JSON.stringify({ enabled: true, run });
			await registered!.refresh();
			expect(runtime.getBalanceShadowSession()?.config).toEqual(run);
		}
		expect(stops).toHaveBeenCalledTimes(3);
		await runtime.stopBalanceShadow();
		await registered!.refresh();
		expect(runtime.getBalanceShadowSession()).toBeUndefined();
		expect(starts).toHaveBeenCalledTimes(4);
		expect(new Set(requests)).toEqual(
			new Set([ADMIN_BALANCE_SHADOW_CONFIG_KEY]),
		);
	} finally {
		await runtime.stopBalanceShadow();
		mock.restore();
	}
}

test("registered S3 polling controls shadow sessions in already-running processes, and read failures turn them off", async () => {
	if (process.env.TEST_BALANCE_SHADOW_EDGE_CHILD === "1") {
		await verifyEdgeWiring();
		return;
	}
	// A fresh module registry isolates startup registration from neighboring track mocks.
	const workerDirectory = new URL(
		"../../../../../apps/balance-worker/",
		import.meta.url,
	).pathname;
	const child = Bun.spawn({
		cmd: [
			process.execPath,
			"test",
			"--config",
			"./bunfig.toml",
			import.meta.filename,
		],
		cwd: workerDirectory,
		env: {
			...process.env,
			UNIT_TESTS: "1",
			TEST_BALANCE_SHADOW_EDGE_CHILD: "1",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(exitCode, stdout + stderr).toBe(0);
});
