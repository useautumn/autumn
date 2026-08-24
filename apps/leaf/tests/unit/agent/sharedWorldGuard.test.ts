/**
 * A shared Postgres workflow world outside production must be an explicit
 * opt-in, and never share the prod queue namespace: with it, this process's
 * eve worker would claim and execute that database's workflow jobs.
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

describe("shared workflow world guard", () => {
	afterEach(resetEnv);

	test("refuses a shared world outside production without opt-in", async () => {
		delete process.env.NODE_ENV;
		delete process.env.EVE_EMBEDDED;
		delete process.env.EVE_ALLOW_SHARED_WORLD;
		process.env.WORKFLOW_POSTGRES_URL = "postgres://prod-host/chat";

		await expect(importAgent()).rejects.toThrow(/outside production/);
	});

	test("opt-in allows the shared world but namespaces the queue locally", async () => {
		delete process.env.NODE_ENV;
		delete process.env.EVE_EMBEDDED;
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.EVE_ALLOW_SHARED_WORLD = "1";
		process.env.WORKFLOW_POSTGRES_URL = "postgres://prod-host/chat";

		await importAgent();

		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toMatch(/^local_/);
	});

	test("production keeps the default namespace", async () => {
		process.env.NODE_ENV = "production";
		delete process.env.WORKFLOW_QUEUE_NAMESPACE;
		process.env.WORKFLOW_POSTGRES_URL = "postgres://prod-host/chat";

		await importAgent();

		expect(process.env.WORKFLOW_QUEUE_NAMESPACE).toBeUndefined();
	});
});
