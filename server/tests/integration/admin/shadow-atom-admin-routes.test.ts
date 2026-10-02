/**
 * The shadow Atom's admin routes on the real app: an org's own secret key, or no auth,
 * never reaches the deployment or results handlers, so nothing is started on alien or written.
 */

import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import * as alienClientModule from "@/external/alien/getAlienClient.js";
import { createHonoApp } from "@/initHono.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

const ROUTES = [
	{ method: "GET", path: "/admin/shadow-atom-config/sandbox/deployment" },
	{
		method: "POST",
		path: "/admin/shadow-atom-config/sandbox/deployment",
		body: { admin_token_hash: "a".repeat(64), cpu: 2, memory: 1 },
	},
	{
		method: "PATCH",
		path: "/admin/shadow-atom-config/live/deployment",
		body: { cpu: 2, memory: 4 },
	},
	{ method: "DELETE", path: "/admin/shadow-atom-config/live/deployment" },
	{ method: "GET", path: "/admin/shadow-atom-config/live/results?range=24h" },
] as const;

let app: ReturnType<typeof createHonoApp>;
const write = spyOn(shadowAtomConfigStore, "writeToSource");
const alien = spyOn(alienClientModule, "getAlienClient");

beforeAll(() => {
	app = createHonoApp();
});
afterAll(() => {
	write.mockRestore();
	alien.mockRestore();
});

const send = ({
	method,
	path,
	body,
	authorization,
}: {
	method: string;
	path: string;
	body?: unknown;
	authorization?: string;
}) =>
	app.fetch(
		new Request(`http://localhost${path}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				...(authorization ? { Authorization: authorization } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);

for (const route of ROUTES) {
	test(`shadow-atom-admin: ${route.method} ${route.path} refuses an org's secret key and no auth`, async () => {
		const withOrgKey = await send({
			...route,
			authorization: `Bearer ${ctx.orgSecretKey}`,
		});
		const anonymous = await send(route);

		expect([401, 403]).toContain(withOrgKey.status);
		expect([401, 403]).toContain(anonymous.status);
		expect(write).not.toHaveBeenCalled();
		expect(alien).not.toHaveBeenCalled();
	});
}
