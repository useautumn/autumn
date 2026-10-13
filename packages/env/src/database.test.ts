import { describe, expect, test } from "bun:test";
import { createDatabaseEnv, resolveDatabaseUrl } from "./database";

const publicUrl =
	"postgresql://pscale_api_abc|read-bouncer:pw@aws-us-east-2-2.pg.psdb.cloud:6432/postgres?sslmode=verify-full";
const onEcs = { ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4" };
const withPrivateHost = {
	DATABASE_PRIVATE_HOST: "aws-us-east-2-2.private-pg.psdb.cloud",
};

describe("resolveDatabaseUrl", () => {
	test("keeps the public host off ECS even when a private host is set", () => {
		expect(
			resolveDatabaseUrl({ url: publicUrl, runtimeEnv: withPrivateHost }),
		).toBe(publicUrl);
	});

	test("keeps the public host on ECS when no private host is set", () => {
		expect(resolveDatabaseUrl({ url: publicUrl, runtimeEnv: onEcs })).toBe(
			publicUrl,
		);
	});

	test("an empty private host counts as unset", () => {
		expect(
			resolveDatabaseUrl({
				url: publicUrl,
				runtimeEnv: { ...onEcs, DATABASE_PRIVATE_HOST: "  " },
			}),
		).toBe(publicUrl);
	});

	test("swaps only the host on ECS with a private host", () => {
		const resolved = new URL(
			resolveDatabaseUrl({
				url: publicUrl,
				runtimeEnv: { ...onEcs, ...withPrivateHost },
			}) as string,
		);
		expect(resolved.hostname).toBe("aws-us-east-2-2.private-pg.psdb.cloud");
		expect(resolved.port).toBe("6432");
		expect(decodeURIComponent(resolved.username)).toBe(
			"pscale_api_abc|read-bouncer",
		);
		expect(resolved.password).toBe("pw");
		expect(resolved.pathname).toBe("/postgres");
		expect(resolved.searchParams.get("sslmode")).toBe("verify-full");
	});

	test("an unset url stays unset", () => {
		expect(
			resolveDatabaseUrl({
				url: undefined,
				runtimeEnv: { ...onEcs, ...withPrivateHost },
			}),
		).toBeUndefined();
	});
});

describe("createDatabaseEnv", () => {
	test("resolves every PlanetScale url on ECS with a private host", () => {
		const env = createDatabaseEnv({
			...onEcs,
			...withPrivateHost,
			DATABASE_URL: publicUrl,
			DATABASE_CRITICAL_URL: publicUrl,
			DATABASE_REPLICA_URL: publicUrl,
		});
		expect(env.DATABASE_PRIVATE_HOST).toBe(
			"aws-us-east-2-2.private-pg.psdb.cloud",
		);
		for (const url of [
			env.DATABASE_URL,
			env.DATABASE_CRITICAL_URL,
			env.DATABASE_REPLICA_URL,
		]) {
			expect(new URL(url as string).hostname).toBe(
				"aws-us-east-2-2.private-pg.psdb.cloud",
			);
		}
	});

	test("reports no private host off ECS and leaves missing urls unset", () => {
		const env = createDatabaseEnv({
			...withPrivateHost,
			DATABASE_URL: publicUrl,
		});
		expect(env.DATABASE_PRIVATE_HOST).toBeNull();
		expect(env.DATABASE_URL).toBe(publicUrl);
		expect(env.DATABASE_CRITICAL_URL).toBeUndefined();
		expect(env.DATABASE_REPLICA_URL).toBeUndefined();
	});
});
