import { afterAll, expect, spyOn, test } from "bun:test";
import { type ShadowAtomConfig, shadowAtomConfig } from "@autumn/edge-config";
import { customers, organizations, RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminShadowAtomNames } from "@/internal/admin/handleGetAdminShadowAtomNames.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

const config: ShadowAtomConfig = (() => {
	const base = shadowAtomConfig.defaultValue();
	return {
		...base,
		sandbox: {
			...base.sandbox,
			rollout: {
				...base.sandbox.rollout,
				orgs: { org_a: 50 },
				customers: { org_b: { cus_1: true } },
			},
			orgs: { org_c: { encryptedToken: "enc", registeredAt: 1 } },
		},
	};
})();
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockResolvedValue(
	config,
);
afterAll(() => read.mockRestore());

const queried: { table: unknown; rows: unknown[] }[] = [];
const rowsByTable = new Map<unknown, unknown[]>([
	[
		organizations,
		[
			{ id: "org_a", name: "Org A", slug: "org-a" },
			{ id: "org_b", name: "Org B", slug: "org-b" },
			{ id: "org_c", name: "Org C", slug: "org-c" },
		],
	],
	[
		customers,
		[
			{
				orgId: "org_b",
				customerId: "cus_1",
				env: "sandbox",
				name: "Customer One",
				email: "one@example.com",
			},
		],
	],
]);
const db = {
	select: () => ({
		from: (table: unknown) => ({
			where: async () => {
				const rows = rowsByTable.get(table) ?? [];
				queried.push({ table, rows });
				return rows;
			},
		}),
	}),
};

const fetchNames = ({ scopes }: { scopes: string[] }) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", { scopes, db } as unknown as HonoEnv["Variables"]["ctx"]);
		await next();
	});
	app.onError(
		(error) =>
			new Response(error.message, {
				status: error instanceof RecaseError ? error.statusCode : 500,
			}),
	);
	app.get(
		"/admin/shadow-atom-config/:env/names",
		...handleGetAdminShadowAtomNames,
	);
	return app.request("/admin/shadow-atom-config/sandbox/names");
};

test("staff get names for every org and pinned customer the env holds by id", async () => {
	const response = await fetchNames({ scopes: [Scopes.Superuser] });

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		orgsById: {
			org_a: { id: "org_a", name: "Org A", slug: "org-a" },
			org_b: { id: "org_b", name: "Org B", slug: "org-b" },
			org_c: { id: "org_c", name: "Org C", slug: "org-c" },
		},
		customerNamesByOrgId: {
			org_b: { cus_1: { name: "Customer One", email: "one@example.com" } },
		},
	});
});

test("an org's own key cannot read the names", async () => {
	const response = await fetchNames({ scopes: [Scopes.Organisation.Read] });

	expect(response.status).toBe(403);
});
