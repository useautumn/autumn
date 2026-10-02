import { describe, expect, test } from "bun:test";
import {
	createPostgresClient,
	sqlOptionsOf,
} from "../../src/createPostgresClient.js";

const config = {
	databaseUrl: "postgres://user:secret@127.0.0.1:1/never",
	maxConnections: 2,
	connectTimeout: 1,
	idleTimeout: 30,
};

describe("createPostgresClient", () => {
	test("opens lazily and closes without ever connecting", async () => {
		const { db, close } = createPostgresClient({ config });

		expect(db.query.customerEntitlements).toBeDefined();
		await expect(close()).resolves.toBeUndefined();
	});

	test("never ends a connection by age unless asked, since Bun fails every query still on it", () => {
		expect(sqlOptionsOf({ config }).maxLifetime).toBe(0);
		expect(
			sqlOptionsOf({ config: { ...config, maxLifetime: 60 } }),
		).toMatchObject({ maxLifetime: 60 });
	});
});
