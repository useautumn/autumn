import { describe, expect, test } from "bun:test";
import { createPostgresClient } from "../../src/createPostgresClient.js";

describe("createPostgresClient", () => {
	test("opens lazily and closes without ever connecting", async () => {
		const { db, close } = createPostgresClient({
			config: {
				databaseUrl: "postgres://user:secret@127.0.0.1:1/never",
				maxConnections: 2,
				connectTimeout: 1,
				idleTimeout: 30,
				maxLifetime: 1800,
			},
		});

		expect(db.query.customerEntitlements).toBeDefined();
		await expect(close()).resolves.toBeUndefined();
	});
});
