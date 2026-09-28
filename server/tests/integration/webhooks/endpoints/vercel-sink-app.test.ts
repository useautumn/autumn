/**
 * The dashboard's Vercel sink page ensures only the current env's Vercel Svix
 * app, and never replaces an app another env (or webhooks.*) already stored.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { AppEnv, apiKeys, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { ApiKeyPrefix, createKey } from "@/internal/dev/apiKeys/apiKeyUtils.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const svix = createSvixCli();
const orgId = generateId("org");
const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;
let key: string;
let liveKey: string;
let liveAppId: string;
const createdByRun: (string | undefined)[] = [];
const clearCache = () => clearOrgCache({ db, orgId });

const storedOrg = async () =>
	db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });

beforeAll(async () => {
	liveAppId = (await svix.application.create({ name: `it-sink-live-${orgId}` }))
		.id;
	await db.insert(organizations).values({
		id: orgId,
		slug: `it-vercel-sink-${orgId}`,
		name: "Vercel sink test",
		logo: "",
		createdAt: new Date(),
		metadata: "",
		processor_configs: {
			vercel: {
				client_integration_id: "keep_me",
				svix: { live_id: liveAppId },
			},
		} as never,
	});
	key = await createKey({
		db,
		env: AppEnv.Sandbox,
		name: "Vercel sink key",
		orgId,
		prefix: ApiKeyPrefix.Sandbox,
		meta: {},
	});
	liveKey = await createKey({
		db,
		env: AppEnv.Live,
		name: "Vercel sink live key",
		orgId,
		prefix: ApiKeyPrefix.Live,
		meta: {},
	});
});

afterAll(async () => {
	const svixIds = (await storedOrg())?.processor_configs?.vercel?.svix;
	for (const appId of new Set([
		liveAppId,
		svixIds?.live_id,
		svixIds?.sandbox_id,
	]))
		if (appId) await svix.application.delete(appId).catch(() => {});
	await db.delete(apiKeys).where(eq(apiKeys.org_id, orgId));
	await db.delete(organizations).where(eq(organizations.id, orgId));
});

test("opening the sandbox sink creates only the sandbox app and keeps the stored live one", async () => {
	const res = await fetch(`${apiBase}/organization/vercel_sink`, {
		headers: { Authorization: `Bearer ${key}` },
	});
	expect(res.status).toBe(200);
	const vercel = (await storedOrg())?.processor_configs?.vercel;
	expect(vercel?.svix?.live_id).toBe(liveAppId);

	expect(vercel?.svix?.sandbox_id).toMatch(/^app_/);
	expect(vercel?.client_integration_id).toBe("keep_me");
	createdByRun.push(vercel?.svix?.sandbox_id);
});

test("with no Vercel apps yet, opening the live sink stores the live app it shows", async () => {
	await db
		.update(organizations)
		.set({
			processor_configs: {
				vercel: { client_integration_id: "keep_me" },
			} as never,
		})
		.where(eq(organizations.id, orgId));
	await clearCache();
	const res = await fetch(`${apiBase}/organization/vercel_sink`, {
		headers: { Authorization: `Bearer ${liveKey}` },
	});
	expect(res.status).toBe(200);
	const svixIds = (await storedOrg())?.processor_configs?.vercel?.svix;
	createdByRun.push(svixIds?.live_id, svixIds?.sandbox_id);
	// Vercel's live events go to the stored live app: it must be the one created.
	expect(svixIds?.live_id).toMatch(/^app_/);
	expect(svixIds?.sandbox_id).toBeUndefined();
});
