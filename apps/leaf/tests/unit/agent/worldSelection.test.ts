/**
 * The chat database is the one durable workflow world: eve selects the
 * Postgres world from CHAT_DATABASE_URL alone (build and runtime alike) and
 * namespaces its queue per machine outside production.
 */

import { afterEach, describe, expect, test } from "bun:test";

const AGENT_MODULE = "../../../agent/agent.js";
const saved = { ...process.env };

const resetEnv = () => {
	for (const key of Object.keys(process.env)) {
		if (!(key in saved)) delete process.env[key];
	}
	Object.assign(process.env, saved);
};

const importAgent = () => import(`${AGENT_MODULE}?${Math.random()}`);

describe("workflow world selection", () => {
	afterEach(resetEnv);

	test("a chat database selects the Postgres world for the world package", async () => {
		delete process.env.NODE_ENV;
		delete process.env.EVE_EMBEDDED;
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.CHAT_DATABASE_URL = "postgres://chat-host/chat";

		const agent = (await importAgent()).default as {
			experimental?: { workflow?: { world?: string } };
		};
		expect(agent.experimental?.workflow?.world).toBe(
			"@workflow/world-postgres",
		);
		expect(process.env.WORKFLOW_POSTGRES_URL).toBe("postgres://chat-host/chat");
		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toMatch(/^local_/);
	});

	test("production keeps the shared queue namespace", async () => {
		process.env.NODE_ENV = "production";
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.CHAT_DATABASE_URL = "postgres://chat-host/chat";

		await importAgent();
		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toBeUndefined();
	});

	test("no chat database means the local file world", async () => {
		delete process.env.CHAT_DATABASE_URL;
		delete process.env.WORKFLOW_POSTGRES_URL;

		const agent = (await importAgent()).default as {
			experimental?: { workflow?: { world?: string } };
		};
		expect(agent.experimental?.workflow?.world).toBeUndefined();
	});
});
