import { expect, mock, test } from "bun:test";
import type { BalanceShadowConfig } from "@/internal/balances/shadow/balanceShadowTypes.js";
import { createBalanceShadowController } from "@/internal/balances/shadow/createBalanceShadowController.js";

function fixture() {
	const run: BalanceShadowConfig = {
		runId: "trial",
		ownershipTopic: "trial.ownership",
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
	let input: unknown = { enabled: false };
	let stopDelay: Promise<void> | undefined;
	const sessions: { config: BalanceShadowConfig; stopped: boolean }[] = [];
	const report = mock(() => {});
	const controller = createBalanceShadowController({
		readConfig: () => input,
		runtimeEnv: { BALANCE_WORKER_SHADOW: JSON.stringify(run) },
		report,
		startSession: ({ config }) => {
			const entry = { config, stopped: false };
			sessions.push(entry);
			const stop = () => {
				entry.stopped = true;
				return stopDelay ?? Promise.resolve();
			};
			return {
				config,
				stop,
				isStopped: () => entry.stopped,
				mirror: {
					submit: () => !entry.stopped,
					record: () => {},
					stop,
					status: () => ({
						submitted: 0,
						completed: 0,
						failed: 0,
						dropped: 0,
						pending: 0,
						inFlight: 0,
					}),
				},
			};
		},
	});
	return {
		controller,
		sessions,
		report,
		run,
		setConfig: (value: unknown) => {
			input = value;
		},
		setStopDelay: (value: Promise<void>) => {
			stopDelay = value;
		},
	};
}

test("edge shadow defaults off without falling back to the environment and starts only in an API or queue process", async () => {
	const f = fixture();
	await f.controller.refresh();
	f.controller.start();
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(0);
	f.setConfig({ enabled: true, run: f.run });
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(1);
	expect(f.controller.getSession()?.config).toEqual(f.run);
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(1);
	await f.controller.stop();
});

test("disabling removes the session immediately, waits for shutdown and ignores late refreshes", async () => {
	const f = fixture();
	f.setConfig({ enabled: true, run: f.run });
	f.controller.start();
	await f.controller.refresh();
	let finish!: () => void;
	f.setStopDelay(
		new Promise<void>((resolve) => {
			finish = resolve;
		}),
	);
	f.setConfig({ enabled: false });
	const disabling = f.controller.refresh();
	expect(f.controller.getSession()).toBeUndefined();
	expect(f.sessions[0]?.stopped).toBe(true);
	const stopping = f.controller.stop();
	f.setConfig({ enabled: true, run: f.run });
	await f.controller.refresh();
	finish();
	await Promise.all([disabling, stopping, f.controller.stop()]);
	expect(f.sessions).toHaveLength(1);
});

test("replacement serializes shutdown and starts only the latest requested run", async () => {
	const f = fixture();
	f.setConfig({ enabled: true, run: f.run });
	f.controller.start();
	await f.controller.refresh();
	let finish!: () => void;
	f.setStopDelay(
		new Promise<void>((resolve) => {
			finish = resolve;
		}),
	);
	f.setConfig({ enabled: true, run: { ...f.run, runId: "superseded" } });
	const first = f.controller.refresh();
	f.setConfig({ enabled: true, run: { ...f.run, runId: "latest" } });
	const second = f.controller.refresh();
	expect(f.controller.getSession()).toBeUndefined();
	expect(f.sessions).toHaveLength(1);
	finish();
	await Promise.all([first, second]);
	expect(f.sessions.map((session) => session.config.runId)).toEqual([
		"trial",
		"latest",
	]);
	await f.controller.stop();
});

test("invalid or expired edge configuration disables copying and reports the failure", async () => {
	for (const input of [
		undefined,
		{ enabled: true },
		{ enabled: true, run: { expiresAt: 0 } },
	]) {
		const f = fixture();
		f.setConfig({ enabled: true, run: f.run });
		f.controller.start();
		await f.controller.refresh();
		f.setConfig(input);
		await f.controller.refresh();
		expect(f.controller.getSession()).toBeUndefined();
		expect(f.sessions[0]?.stopped).toBe(true);
		await f.controller.stop();
	}
	const f = fixture();
	f.setConfig({ enabled: true, run: { ...f.run, expiresAt: Date.now() - 1 } });
	f.controller.start();
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(0);
	expect(f.report).toHaveBeenCalled();
	await f.controller.stop();
});

test("a stopped startup can be retried without changing the edge run", async () => {
	const f = fixture();
	f.setConfig({ enabled: true, run: f.run });
	f.controller.start();
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(1);
	f.sessions[0]!.stopped = true;
	await f.controller.refresh();
	expect(f.sessions).toHaveLength(2);
	await f.controller.stop();
});

test("configuration, session construction and reporting failures cannot break server startup", async () => {
	const f = fixture();
	let input: unknown = { enabled: true, run: f.run };
	const controller = createBalanceShadowController({
		readConfig: () => input,
		runtimeEnv: {},
		startSession: () => {
			throw new Error("Cannot construct client");
		},
		report: () => {
			throw new Error("Logger failed");
		},
	});
	controller.start();
	await controller.refresh();
	expect(controller.getSession()).toBeUndefined();
	input = { enabled: "invalid" };
	await controller.refresh();
	await controller.stop();
});
