/**
 * sync's deletes reach the app each endpoint lives in: an id present in both
 * the main and the Vercel app (a concurrent-create leftover) is deleted from both.
 */

import { expect, test } from "bun:test";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const deleted: string[] = [];
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
			list: async () => ({ data: [endpointOut("billing")], done: true }),
			delete: async (appId: string, id: string) => {
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
