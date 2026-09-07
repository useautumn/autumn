import { afterAll, describe, expect, test } from "bun:test";
import { AppEnv, apiKeys, organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	ApiKeyPrefix,
	createKey,
	hashApiKey,
} from "@/internal/dev/apiKeys/apiKeyUtils.js";

// Exercises the createRoute request path (zod validation + actor guards) over
// real HTTP, which the *_ForOrg unit/integration tests bypass. Requires `bun dw`.
// create/list/delete are open to a main-org secret key (resolveSandboxActor);
// update/copy stayed dashboard-only (assertDashboardActor, still 401).

const { db } = initDrizzle();
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const masterKey = defaultCtx.orgSecretKey;

const postAs = async ({
	path,
	body,
	key,
}: {
	path: string;
	body: unknown;
	key: string;
}) =>
	await fetch(`${apiBase}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

const post = async (path: string, body: unknown) =>
	await postAs({ path, body, key: masterKey });

const postStatus = async (path: string, body: unknown) =>
	(await post(path, body)).status;

const createdSandboxName = `Route Guard Sandbox ${crypto.randomUUID()}`;
let createdSandboxId: string | undefined;

let liveKey: string | undefined;

afterAll(async () => {
	if (liveKey) {
		await db
			.delete(apiKeys)
			.where(eq(apiKeys.hashed_key, hashApiKey(liveKey)))
			.catch(() => {});
	}
	if (!createdSandboxId) return;
	await postStatus("/sandboxes.delete", { id: createdSandboxId });
	await db
		.delete(organizations)
		.where(eq(organizations.id, createdSandboxId))
		.catch(() => {});
});

describe("sandbox route guards (zod + actor wiring on the request path)", () => {
	test("create with an out-of-allowlist colour is rejected by zod (400)", async () => {
		const status = await postStatus("/sandboxes.create", {
			name: createdSandboxName,
			color: "purple",
			icon: "Flask",
		});
		expect(status).toBe(400);
	});

	test("update with an id-only body fails the at-least-one-field refine (400)", async () => {
		const status = await postStatus("/sandboxes.update", {
			id: "sandbox_does_not_exist",
		});
		expect(status).toBe(400);
	});

	test("create from a main-org secret key is allowed (the owner member is the actor)", async () => {
		const res = await post("/sandboxes.create", {
			name: createdSandboxName,
			color: "blue",
			icon: "Flask",
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as { id: string; secret_key: string };
		createdSandboxId = body.id;
		expect(body.secret_key).toMatch(/^am_sk_test/);
	});

	test("list from a main-org secret key is allowed", async () => {
		const status = await postStatus("/sandboxes.list", {});
		expect(status).toBe(200);
	});

	test("copy from a secret key is still blocked by assertDashboardActor (401)", async () => {
		const status = await postStatus("/sandboxes.copy", {
			fromMaster: true,
			toSandboxId: "sandbox_does_not_exist",
		});
		expect(status).toBe(401);
	});

	// A live key resolves to AppEnv.Live, and reset is refused there before it
	// deletes anything — the only reset case safe to drive against a real org.
	test("reset from a live-mode key is refused (400)", async () => {
		liveKey = await createKey({
			db,
			env: AppEnv.Live,
			name: "Route Guard Live Key",
			orgId: defaultCtx.org.id,
			prefix: ApiKeyPrefix.Live,
			meta: {},
		});

		const res = await postAs({
			path: "/sandboxes.reset",
			body: {},
			key: liveKey,
		});
		expect(res.status).toBe(400);

		const { message } = (await res.json()) as { message?: string };
		expect(message).toBe("Only sandboxes can be reset");
	});
});
