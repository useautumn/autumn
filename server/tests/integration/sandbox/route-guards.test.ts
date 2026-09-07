import { afterAll, describe, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

// Exercises the createRoute request path (zod validation + actor guards) over
// real HTTP, which the *_ForOrg unit/integration tests bypass. Requires `bun dw`.
// create/list/delete are open to a main-org secret key (resolveSandboxActor);
// update/copy stayed dashboard-only (assertDashboardActor, still 401).

const { db } = initDrizzle();
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const masterKey = defaultCtx.orgSecretKey;

const post = async (path: string, body: unknown) =>
	await fetch(`${apiBase}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${masterKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

const postStatus = async (path: string, body: unknown) =>
	(await post(path, body)).status;

const createdSandboxName = `Route Guard Sandbox ${crypto.randomUUID()}`;
let createdSandboxId: string | undefined;

afterAll(async () => {
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
});
