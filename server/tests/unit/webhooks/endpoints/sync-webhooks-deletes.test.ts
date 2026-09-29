/**
 * sync's deletes reach the app each endpoint lives in: an id present in both
 * the main and the Vercel app (a concurrent-create leftover) is deleted from both,
 * and one app failing never stops the other's delete.
 */

import { expect, test } from "bun:test";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const deleted: string[] = [];
/** `appId/id` pairs whose delete throws. */
const failing = new Set<string>();
/** What each app lists; `billing` sits in both, as a concurrent create leaves it. */
const held: Record<string, string[]> = {
	app_main: ["billing"],
	app_vercel: ["billing"],
};
const endpointOut = (id: string) => ({
	id,
	uid: id,
	url: "https://example.com/hook",
	description: "",
	filterTypes: ["billing.updated"],
	disabled: false,
	createdAt: new Date(1),
	updatedAt: new Date(1),
	version: 1,
});

await mockModuleWithRestore("@/external/svix/svixUtils.js", () => ({
	createSvixCli: () => ({
		endpoint: {
			list: async (appId: string) => ({
				data: (held[appId] ?? []).map(endpointOut),
				done: true,
			}),
			delete: async (appId: string, id: string) => {
				if (failing.has(`${appId}/${id}`)) throw new Error("svix down");
				deleted.push(`${appId}/${id}`);
			},
		},
	}),
}));

const { syncWebhooks } = await import(
	"@/internal/webhooks/actions/sync/syncWebhooks.js"
);

test("an id living in both apps is deleted from both", async () => {
	const result = await syncWebhooks({
		apps: [
			{ kind: "main", appId: "app_main" },
			{ kind: "vercel", appId: "app_vercel" },
		],
		appIdForKind: async () => "app_main",
		stated: [],
		skipDeletions: false,
	});
	expect(result.errors).toEqual([]);
	expect(deleted.sort()).toEqual(["app_main/billing", "app_vercel/billing"]);
});

test("a failed delete in one app still deletes the id from the other, and is reported per id", async () => {
	deleted.length = 0;
	held.app_vercel = ["billing", "audit"];
	failing.add("app_main/billing");
	const result = await syncWebhooks({
		apps: [
			{ kind: "main", appId: "app_main" },
			{ kind: "vercel", appId: "app_vercel" },
		],
		appIdForKind: async () => "app_main",
		stated: [],
		skipDeletions: false,
	});
	expect(result.errors.map((error) => error.id)).toEqual(["billing"]);
	expect(deleted.sort()).toEqual(["app_vercel/audit", "app_vercel/billing"]);
	failing.clear();
	held.app_vercel = ["billing"];
});
