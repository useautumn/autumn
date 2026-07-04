import { describe, expect, test } from "bun:test";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";

// Exercises the createRoute request path (zod validation + handler guards) over
// real HTTP, which the *_ForOrg unit/integration tests bypass. Requires `bun dw`.
// A secret key is AuthType.SecretKey, so it clears the legacy fail-open scope
// gate and lets us prove the next two layers: zod (400) then assertDashboardActor
// (401, the dashboard-only boundary that includes the sandboxes.list fix).

const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
const masterKey = defaultCtx.orgSecretKey;

const postStatus = async (path: string, body: unknown) => {
	const res = await fetch(`${apiBase}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${masterKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	return res.status;
};

describe("sandbox route guards (zod + dashboard-actor wiring on the request path)", () => {
	test("create with an out-of-allowlist colour is rejected by zod (400)", async () => {
		const status = await postStatus("/sandboxes.create", {
			name: "Route Guard Sandbox",
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

	test("create from a secret key (not a dashboard actor) is blocked by assertDashboardActor (401)", async () => {
		const status = await postStatus("/sandboxes.create", {
			name: "Route Guard Sandbox",
			color: "blue",
			icon: "Flask",
		});
		expect(status).toBe(401);
	});

	test("list from a secret key is blocked by assertDashboardActor (401)", async () => {
		const status = await postStatus("/sandboxes.list", {});
		expect(status).toBe(401);
	});

	test("copy from a secret key is blocked by assertDashboardActor (401)", async () => {
		const status = await postStatus("/sandboxes.copy", {
			fromMaster: true,
			toSandboxId: "sandbox_does_not_exist",
		});
		expect(status).toBe(401);
	});
});
