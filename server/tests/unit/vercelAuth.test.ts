import { AppEnv } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { verifyToken } from "@/external/vercel/misc/vercelAuth.js";

const org = {
	processor_configs: {
		vercel: {
			sandbox_client_id: "test_client_id",
			client_integration_id: "live_client_id",
		},
	},
} as any;

const withNodeEnv = async <T>(env: string, fn: () => Promise<T>) => {
	const original = process.env.NODE_ENV;
	process.env.NODE_ENV = env;
	try {
		return await fn();
	} finally {
		if (original === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = original;
		}
	}
};

const silenceWarn = async <T>(fn: () => Promise<T>) => {
	const original = console.warn;
	console.warn = () => {};
	try {
		return await fn();
	} finally {
		console.warn = original;
	}
};

describe("verifyToken test OIDC bypass", () => {
	test("accepts test_oidc only when request test option allows it", async () => {
		await withNodeEnv("development", async () => {
			const claims = await verifyToken({
				token: "test_oidc:icfg_test",
				org,
				env: AppEnv.Sandbox,
				testOptions: { allowVercelTestOidc: true },
			});

			expect(claims.installation_id).toBe("icfg_test");
			expect(claims.aud).toBe("test_client_id");
		});
	});

	test("rejects test_oidc without the request test option", async () => {
		await withNodeEnv("development", async () => {
			await silenceWarn(async () => {
				await expect(
					verifyToken({
						token: "test_oidc:icfg_test",
						org,
						env: AppEnv.Sandbox,
					}),
				).rejects.toThrow();
			});
		});
	});

	test("rejects test_oidc in production even with the request test option", async () => {
		await withNodeEnv("production", async () => {
			await silenceWarn(async () => {
				await expect(
					verifyToken({
						token: "test_oidc:icfg_test",
						org,
						env: AppEnv.Sandbox,
						testOptions: { allowVercelTestOidc: true },
					}),
				).rejects.toThrow();
			});
		});
	});
});
