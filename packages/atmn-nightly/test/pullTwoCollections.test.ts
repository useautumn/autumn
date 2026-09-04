/** One imported file holding two collections' arrays: each server-only row
 * is appended into its own array. */

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { runPull } from "../src/actions/pull";

const dir = `${import.meta.dir}/.tmp/pull-two-collections`;

test("features and plans in one catalog.ts each receive their append", async () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		`${dir}/autumn.config.ts`,
		'import { features, plans } from "./catalog";\nimport { atmn } from "../../../src/generated/wire";\n\nexport default atmn({ features, plans });\n',
	);
	writeFileSync(
		`${dir}/catalog.ts`,
		'import { feature } from "../../../src/generated/features";\nimport { plan } from "../../../src/generated/plans";\n\nexport const features = [\n\tfeature({ featureId: "seats", name: "Seats", type: "boolean" }),\n];\n\nexport const plans = [\n\tplan({ planId: "pro", name: "Pro" }),\n];\n',
	);
	const rows = {
		features: [
			{
				id: "seats",
				internalId: "fe_seats",
				name: "Seats",
				type: "boolean",
				archived: false,
			},
			{
				id: "sso",
				internalId: "fe_sso",
				name: "SSO",
				type: "boolean",
				archived: false,
			},
		],
		plans: [
			{
				id: "pro",
				internalId: "prod_pro",
				name: "Pro",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				items: [],
			},
			{
				id: "free",
				internalId: "prod_free",
				name: "Free",
				version: 1,
				versionSlug: "v1",
				active: true,
				archived: false,
				items: [],
			},
		],
	};
	const preview = {
		features: [
			{ featureId: "seats", action: "none", internalId: "fe_seats" },
			{ featureId: "sso", action: "delete", internalId: "fe_sso" },
		],
		plans: [
			{
				planId: "pro",
				version: 1,
				versionSlug: "v1",
				active: true,
				action: "none",
				internalId: "prod_pro",
				state: {},
			},
			{
				planId: "free",
				version: 1,
				versionSlug: "v1",
				active: true,
				action: "delete",
				internalId: "prod_free",
				state: {},
			},
		],
	};
	const client = {
		previewUpdate: async () => preview,
		update: async () => ({}),
		get: async () => rows,
	};
	// biome-ignore lint/suspicious/noExplicitAny: a fake client
	const result = await runPull({
		client: client as any,
		cwd: dir,
		write: () => {},
	});
	const catalog = readFileSync(`${dir}/catalog.ts`, "utf8");
	expect(result.appended.sort()).toEqual(["free@v1", "sso"]);
	expect(catalog).toContain('featureId: "sso"');
	expect(catalog).toContain('planId: "free"');
	expect(readFileSync(`${dir}/autumn.config.ts`, "utf8")).toContain(
		"atmn({ features, plans })",
	);
});
