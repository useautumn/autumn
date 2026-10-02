import { afterAll, expect, spyOn, test } from "bun:test";
import { type ShadowAtomConfig, shadowAtomConfig } from "@autumn/edge-config";
import { organizations, RecaseError, Scopes } from "@autumn/shared";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetAdminShadowAtomNames } from "@/internal/admin/handleGetAdminShadowAtomNames.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

const config: ShadowAtomConfig = (() => {
	const base = shadowAtomConfig.defaultValue();
	const org = (registeredAt: number) => ({
		encryptedToken: "enc",
		registeredAt,
		percent: 100,
		previousPercent: 0,
		changedAt: 0,
	});
	return {
		...base,
		sandbox: { ...base.sandbox, orgs: { org_a: org(1), org_b: org(2) } },
	};
})();
const read = spyOn(shadowAtomConfigStore, "readFromSource").mockResolvedValue(
	config,
);
afterAll(() => read.mockRestore());

const orgRows = [
	{ id: "org_a", name: "Org A", slug: "org-a" },
	{ id: "org_b", name: "Org B", slug: "org-b" },
];
const db = {
	select: () => ({
		from: (table: unknown) => ({
			where: async () => (table === organizations ? orgRows : []),
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

test("staff get the name and slug of every org registered on the env's shadow Atom", async () => {
	const response = await fetchNames({ scopes: [Scopes.Superuser] });

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		orgsById: {
			org_a: { id: "org_a", name: "Org A", slug: "org-a" },
			org_b: { id: "org_b", name: "Org B", slug: "org-b" },
		},
	});
});

test("an org's own key cannot read the names", async () => {
	const response = await fetchNames({ scopes: [Scopes.Organisation.Read] });

	expect(response.status).toBe(403);
});
