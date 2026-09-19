import { expect, spyOn, test } from "bun:test";

async function verifyAdminConfig() {
	const { RecaseError, Scopes } = await import("@autumn/shared");
	const { Hono } = await import("hono");
	const { z } = await import("zod/v4");
	const { handleGetAdminBalanceShadowConfig } = await import(
		"@/internal/admin/handleGetAdminBalanceShadowConfig.js"
	);
	const { handleUpsertAdminBalanceShadowConfig } = await import(
		"@/internal/admin/handleUpsertAdminBalanceShadowConfig.js"
	);
	const { balanceShadowStore } = await import(
		"@/internal/balances/shadow/balanceShadowStore.js"
	);
	type HonoEnv = import("@/honoUtils/HonoEnv.js").HonoEnv;
	const write = spyOn(balanceShadowStore, "writeToSource").mockResolvedValue();
	const read = spyOn(balanceShadowStore, "readFromSource");
	const originalDeployment = process.env.BALANCE_WORKER_DEPLOYMENT;
	const input = {
		enabled: true as const,
		run: {
			runId: "ui-run",
			ownershipTopic: "ui-run.ownership",
			expiresAt: Date.now() + 60_000,
			customers: [
				{
					orgId: "org",
					env: "sandbox" as const,
					customerId: "external-customer",
					featureId: "messages",
				},
			],
		},
	};
	const createApp = ({
		scopes = [Scopes.Superuser],
	}: {
		scopes?: string[];
	} = {}) => {
		const app = new Hono<HonoEnv>();
		app.use("*", async (c, next) => {
			c.set("ctx", { scopes } as HonoEnv["Variables"]["ctx"]);
			await next();
		});
		app.onError(
			(error) =>
				new Response(error.message, {
					status:
						error instanceof RecaseError
							? error.statusCode
							: error instanceof z.ZodError
								? 400
								: 500,
				}),
		);
		app.get(
			"/admin/balance-shadow-config",
			...handleGetAdminBalanceShadowConfig,
		);
		app.put(
			"/admin/balance-shadow-config",
			...handleUpsertAdminBalanceShadowConfig,
		);
		return app;
	};
	const save = ({ config, scopes }: { config: unknown; scopes?: string[] }) =>
		createApp({ scopes }).request("/admin/balance-shadow-config", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(config),
		});
	const restoreEnvironment = () => {
		if (originalDeployment === undefined)
			delete process.env.BALANCE_WORKER_DEPLOYMENT;
		else process.env.BALANCE_WORKER_DEPLOYMENT = originalDeployment;
	};
	try {
		process.env.BALANCE_WORKER_DEPLOYMENT = "direct";
		const expired = { ...input, run: { ...input.run, expiresAt: 1 } };
		read.mockResolvedValue(expired);
		const loaded = await createApp().request("/admin/balance-shadow-config");
		expect(loaded.status, "expired configs must remain readable").toBe(200);
		expect(await loaded.json()).toEqual(expired);
		expect(write).not.toHaveBeenCalled();

		const saved = await save({ config: input });
		expect(saved.status).toBe(200);
		expect(await saved.json()).toEqual({ success: true });
		expect(write).toHaveBeenCalledWith({ config: input });
		write.mockClear();

		const invalid = [
			{ reason: "expired", run: expired.run },
			{
				reason: "beyond 24 hours",
				run: { ...input.run, expiresAt: Date.now() + 86_460_000 },
			},
			{
				reason: "duplicate",
				run: {
					...input.run,
					customers: [...input.run.customers, ...input.run.customers],
				},
			},
			{
				reason: "ownership topic",
				run: { ...input.run, ownershipTopic: "direct-ownership" },
			},
			{ reason: "empty cohort", run: { ...input.run, customers: [] } },
			{
				reason: "large cohort",
				run: {
					...input.run,
					customers: Array.from({ length: 21 }, () => input.run.customers[0]),
				},
			},
			{
				reason: "16 KiB cap",
				run: {
					...input.run,
					customers: Array.from({ length: 20 }, (_, index) => ({
						orgId: "é".repeat(200),
						env: "sandbox",
						customerId: String(index).padEnd(200, "x"),
						featureId: "é".repeat(200),
					})),
				},
			},
		];
		for (const { reason, run } of invalid) {
			const response = await save({ config: { enabled: true, run } });
			expect(response.status, reason).toBe(400);
			expect(write, reason).not.toHaveBeenCalled();
		}
		expect(
			(await save({ config: { enabled: false } })).status,
			"off must always be saveable",
		).toBe(200);
		expect(write).toHaveBeenCalledWith({ config: { enabled: false } });
		write.mockClear();
		read.mockClear();

		const scopes = [Scopes.Public];
		expect(
			(await createApp({ scopes }).request("/admin/balance-shadow-config"))
				.status,
		).toBe(403);
		expect((await save({ config: input, scopes })).status).toBe(403);
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();

		read.mockRejectedValue(new Error("S3 unavailable"));
		write.mockRejectedValue(new Error("S3 unavailable"));
		expect(
			(await createApp().request("/admin/balance-shadow-config")).status,
		).toBe(500);
		expect((await save({ config: input })).status).toBe(500);
	} finally {
		restoreEnvironment();
		write.mockRestore();
		read.mockRestore();
	}
}

test.concurrent(
	"admin shadow config enforces authorization, run policy and source failures",
	async () => {
		if (process.env.BALANCE_SHADOW_ADMIN_TEST_CHILD === "1") {
			await verifyAdminConfig();
			return;
		}
		// Isolate environment gates and singleton store spies from concurrent unit tests.
		const child = Bun.spawn({
			cmd: [process.execPath, "test", import.meta.filename],
			cwd: new URL("../../../", import.meta.url).pathname,
			env: {
				...process.env,
				UNIT_TESTS: "1",
				UNIT_TEST_FILES: "tests/unit/edge-config/balance-shadow-admin.test.ts",
				BALANCE_SHADOW_ADMIN_TEST_CHILD: "1",
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
	},
	10_000,
);
