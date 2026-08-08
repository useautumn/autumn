/**
 * TDD test for superuser-only hidden dashboard API keys.
 *
 * Contract under test:
 *   New types/fields:
 *     - POST /dev/api_key accepts hidden?: boolean, default false
 *     - hidden rows have meta.visibility = "superuser", preserve
 *       meta.created_via = "autumn_support", and record the impersonating user
 *   New endpoints:
 *     - GET /dev/api_key/hidden -> { api_keys: safe API-key list items[] }
 *   New behaviors:
 *     - only an impersonating superuser can create a hidden key
 *     - /dev/data never returns explicitly hidden keys
 *     - legacy autumn_support keys without visibility remain visible
 *     - only superusers can list hidden keys for the active org and environment
 *     - ordinary API-key writers cannot delete a hidden key by a known id
 *   Side effects:
 *     - hidden creation inserts one usable api_keys row
 *     - authorized deletion removes the row and invalidates the key cache
 *
 * Pre-impl red: hidden is stripped from creation, the private endpoint does not
 * exist, normal listing leaks hidden rows, and deletion has no visibility guard.
 * Post-impl green: every assertion below enforces the complete contract.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	apiKeys,
	organizations,
	session as sessionTable,
} from "@autumn/shared";
import {
	createDashboardSession,
	type DashboardSession,
	dashboardFetch,
	dashboardGet,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { and, eq, inArray } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { ApiKeyPrefix, createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";

const { db } = initDrizzle();
const runId = crypto.randomUUID();
const orgId = `org_hidden_keys_${runId}`;
const testCtx = {
	org: { id: orgId },
	env: AppEnv.Sandbox,
};
const names = {
	visible: `tdd-visible-${runId}`,
	legacySupport: `tdd-legacy-support-${runId}`,
	hiddenSandbox: `tdd-hidden-sandbox-${runId}`,
	hiddenLive: `tdd-hidden-live-${runId}`,
	ownerAttempt: `tdd-owner-attempt-${runId}`,
	adminAttempt: `tdd-admin-attempt-${runId}`,
	impersonatedCreate: `tdd-impersonated-create-${runId}`,
	deleteGuard: `tdd-delete-guard-${runId}`,
};
const allNames = Object.values(names);

let owner: DashboardSession;
let globalAdmin: DashboardSession;
let impersonated: DashboardSession;

const postApiKey = (
	session: DashboardSession,
	body: { name: string; hidden?: boolean },
) =>
	dashboardFetch<{ api_key?: string; message?: string }>(
		testCtx,
		session,
		"/dev/api_key",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		},
	);

const insertFixtureKey = ({
	name,
	env,
	meta,
}: {
	name: string;
	env: AppEnv;
	meta: Record<string, unknown>;
}) =>
	createKey({
		db,
		env,
		name,
		orgId,
		prefix: env === AppEnv.Live ? ApiKeyPrefix.Live : ApiKeyPrefix.Sandbox,
		meta,
		scopes: null,
	});

beforeAll(async () => {
	await db.insert(organizations).values({
		id: orgId,
		slug: `hidden-keys-${runId}`,
		name: "Hidden API Keys TDD",
		createdAt: new Date(),
	});

	owner = await createDashboardSession(testCtx);
	globalAdmin = await createDashboardSession(testCtx, {
		globalRole: "admin",
	});
	impersonated = await createDashboardSession(testCtx);

	await db
		.update(sessionTable)
		.set({ impersonatedBy: globalAdmin.userId })
		.where(eq(sessionTable.userId, impersonated.userId));

	await Promise.all([
		insertFixtureKey({
			name: names.visible,
			env: AppEnv.Sandbox,
			meta: { author: "Dashboard User" },
		}),
		insertFixtureKey({
			name: names.legacySupport,
			env: AppEnv.Sandbox,
			meta: { created_via: "autumn_support" },
		}),
		insertFixtureKey({
			name: names.hiddenSandbox,
			env: AppEnv.Sandbox,
			meta: {
				created_via: "autumn_support",
				visibility: "superuser",
				created_by: globalAdmin.userId,
			},
		}),
		insertFixtureKey({
			name: names.hiddenLive,
			env: AppEnv.Live,
			meta: {
				created_via: "autumn_support",
				visibility: "superuser",
				created_by: globalAdmin.userId,
			},
		}),
	]);
});

afterAll(async () => {
	await db
		.delete(apiKeys)
		.where(and(eq(apiKeys.org_id, orgId), inArray(apiKeys.name, allNames)));
	await Promise.all([
		owner.cleanup(),
		globalAdmin.cleanup(),
		impersonated.cleanup(),
	]);
	await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("hidden dashboard API keys", () => {
	test("rejects hidden creation by an ordinary API-key writer", async () => {
		const response = await postApiKey(owner, {
			name: names.ownerAttempt,
			hidden: true,
		});

		expect(response.status).toBe(403);
		expect(
			await db.query.apiKeys.findFirst({
				where: eq(apiKeys.name, names.ownerAttempt),
			}),
		).toBeUndefined();
	});

	test("rejects hidden creation by a non-impersonating global admin", async () => {
		const response = await postApiKey(globalAdmin, {
			name: names.adminAttempt,
			hidden: true,
		});

		expect(response.status).toBe(403);
		expect(
			await db.query.apiKeys.findFirst({
				where: eq(apiKeys.name, names.adminAttempt),
			}),
		).toBeUndefined();
	});

	test("creates and attributes a hidden key from an impersonation session", async () => {
		const response = await postApiKey(impersonated, {
			name: names.impersonatedCreate,
			hidden: true,
		});

		expect(response.status).toBe(200);
		expect(response.data.api_key).toStartWith("am_sk_test_");

		const created = await db.query.apiKeys.findFirst({
			where: eq(apiKeys.name, names.impersonatedCreate),
		});
		expect(created?.meta).toMatchObject({
			created_via: "autumn_support",
			visibility: "superuser",
			created_by: globalAdmin.userId,
		});
	});

	test("keeps hidden keys out of normal data while legacy support keys remain visible", async () => {
		const response = await dashboardGet<{
			api_keys: Array<{ name: string }>;
		}>(testCtx, owner, "/dev/data");

		expect(response.status).toBe(200);
		expect(response.data.api_keys.map((key) => key.name)).not.toContain(
			names.hiddenSandbox,
		);
		expect(response.data.api_keys.map((key) => key.name)).toContain(
			names.visible,
		);
		expect(response.data.api_keys.map((key) => key.name)).toContain(
			names.legacySupport,
		);
	});

	test("rejects the private list for a non-superuser", async () => {
		const response = await dashboardGet(testCtx, owner, "/dev/api_key/hidden");

		expect(response.status).toBe(403);
	});

	test("lists only safe hidden-key metadata for the active environment", async () => {
		const response = await dashboardGet<{
			api_keys: Array<Record<string, unknown> & { name: string }>;
		}>(testCtx, impersonated, "/dev/api_key/hidden");

		expect(response.status).toBe(200);
		expect(response.data.api_keys.map((key) => key.name)).toContain(
			names.hiddenSandbox,
		);
		expect(response.data.api_keys.map((key) => key.name)).not.toContain(
			names.hiddenLive,
		);
		expect(response.data.api_keys.map((key) => key.name)).not.toContain(
			names.visible,
		);
		for (const key of response.data.api_keys) {
			expect(key).not.toHaveProperty("hashed_key");
			expect(key).not.toHaveProperty("api_key");
		}
	});

	test("protects deletion by id while allowing the impersonating superuser", async () => {
		await insertFixtureKey({
			name: names.deleteGuard,
			env: AppEnv.Sandbox,
			meta: {
				created_via: "autumn_support",
				visibility: "superuser",
				created_by: globalAdmin.userId,
			},
		});
		const key = await db.query.apiKeys.findFirst({
			where: eq(apiKeys.name, names.deleteGuard),
		});
		expect(key).toBeDefined();

		const denied = await dashboardFetch(
			testCtx,
			owner,
			`/dev/api_key/${key!.id}`,
			{ method: "DELETE" },
		);
		expect(denied.status).toBe(404);
		expect(
			await db.query.apiKeys.findFirst({
				where: eq(apiKeys.id, key!.id),
			}),
		).toBeDefined();

		const deleted = await dashboardFetch(
			testCtx,
			impersonated,
			`/dev/api_key/${key!.id}`,
			{ method: "DELETE" },
		);
		expect(deleted.status).toBe(200);
		expect(
			await db.query.apiKeys.findFirst({
				where: eq(apiKeys.id, key!.id),
			}),
		).toBeUndefined();
	});
});
