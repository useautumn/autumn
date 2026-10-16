/**
 * `atmn api <group> <method>` commands are snake_case like the wire; a
 * camelCase RPC path still gets a command, and the request keeps its path.
 */

import { expect, test } from "bun:test";
import { apiRoutesOf } from "../src/emit/emitApiRoutes";
import { loadSpec, PUBLIC_SPEC_PATH } from "../src/spec/loadSpec";

const post = { post: { description: "A route." } };

test("camelCase groups and methods become snake_case commands on their original path", () => {
	const routes = apiRoutesOf({
		spec: {
			paths: {
				"/v1/invoices.listTemplates": post,
				"/v1/catalogV2.update": post,
				"/v1/customers.get_or_create": post,
			},
		},
	});
	expect(
		routes.map(({ group, method, path }) => ({ group, method, path })),
	).toEqual([
		{
			group: "invoices",
			method: "list_templates",
			path: "/v1/invoices.listTemplates",
		},
		{ group: "catalog_v2", method: "update", path: "/v1/catalogV2.update" },
		{
			group: "customers",
			method: "get_or_create",
			path: "/v1/customers.get_or_create",
		},
	]);
});

test("two paths that snake_case to the same command fail generation", () => {
	expect(() =>
		apiRoutesOf({
			spec: {
				paths: {
					"/v1/invoices.listTemplates": post,
					"/v1/invoices.list_templates": post,
				},
			},
		}),
	).toThrow("invoices list_templates");
});

test("the public spec: every RPC route becomes a command, listTemplates included", () => {
	const spec = loadSpec({ path: PUBLIC_SPEC_PATH });
	const rpcPaths = Object.entries(spec.paths)
		.filter(
			([path, methods]) =>
				/^\/v1\/\w+\.\w+$/.test(path) && methods.post !== undefined,
		)
		.map(([path]) => path);
	const routes = apiRoutesOf({ spec });
	expect(routes.map((route) => route.path).sort()).toEqual(rpcPaths.sort());
	expect(
		routes.find(
			(route) =>
				route.group === "invoices" && route.method === "list_templates",
		)?.path,
	).toBe("/v1/invoices.listTemplates");
});
