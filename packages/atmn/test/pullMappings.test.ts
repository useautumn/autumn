import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPull } from "../src/actions/pull";
import { applyMappings } from "../src/actions/pull/applyMappings";
import { type AutumnClient, createClient } from "../src/generated/client";

const remoteItem = ({
	interval,
	priceId,
}: {
	interval: string;
	priceId: string;
}) => ({
	featureId: "seats",
	mappingIdentity: JSON.stringify(["seats", "prepaid", interval, 1]),
	price: {
		billingMethod: "prepaid",
		interval,
		intervalCount: 1,
		amount: 10,
		processors: { stripe: { priceId } },
	},
});
const planRow = {
	id: "pro",
	name: "Pro",
	active: true,
	versionSlug: "v1",
	processors: { stripe: { productId: "prod_synthetic" } },
	price: {
		amount: 20,
		interval: "month",
		processors: { stripe: { priceId: "price_base" } },
	},
	items: [
		remoteItem({ interval: "month", priceId: "price_month" }),
		remoteItem({ interval: "year", priceId: "price_year" }),
	],
};
const planSource = `export default atmn({ plans: [plan({
	planId: "pro", name: "Pro", active: true,
	price: { amount: 20, interval: "month" },
	items: [
		{ featureId: "seats", price: { billingMethod: "prepaid", interval: "year", amount: 10 } },
		{ featureId: "seats", price: { billingMethod: "prepaid", interval: "month", amount: 10 } },
	],
})] });`;

test("mapping splice preserves reordered items and unrelated source", () => {
	const configPath = "/synthetic/autumn.config.ts";
	const source = planSource.replace(
		'name: "Pro"',
		'name: "Pro", description: computeDescription() /* keep me */',
	);
	const files = new Map([[configPath, source]]);
	const result = applyMappings({
		catalog: { plans: [planRow] },
		configPath,
		files,
	});
	expect(result.unlocated).toEqual([]);
	expect(result.replaced).toEqual(["pro@v1"]);
	const output = files.get(configPath) ?? "";
	expect(output).toContain("description: computeDescription() /* keep me */");
	expect(output.indexOf("price_year")).toBeLessThan(
		output.indexOf("price_month"),
	);
	expect(output).toContain("price_base");
	expect(output).toContain("prod_synthetic");
	expect(
		applyMappings({ catalog: { plans: [planRow] }, configPath, files })
			.replaced,
	).toEqual([]);
	expect(files.get(configPath)).toBe(output);
});

test("mapping splice scopes equal public plan IDs to their version", () => {
	const configPath = "/synthetic/autumn.config.ts";
	const source = `plan({ planId: "pro", versionSlug: "v1" });\nplan({ planId: "pro", versionSlug: "v2" });`;
	const files = new Map([[configPath, source]]);
	const result = applyMappings({
		catalog: {
			plans: [
				{
					id: "pro",
					versionSlug: "v2",
					processors: { stripe: { productId: "prod_v2" } },
				},
				{
					id: "pro",
					versionSlug: "v1",
					processors: { stripe: { productId: "prod_v1" } },
				},
			],
		},
		configPath,
		files,
	});
	expect(result.unlocated).toEqual([]);
	const output = files.get(configPath) ?? "";
	expect(output).toContain("prod_v1");
	expect(output.indexOf("prod_v1")).toBeLessThan(output.indexOf("prod_v2"));
});

test("mapping splice refreshes changed IDs and removes unset mappings", () => {
	const configPath = "/synthetic/autumn.config.ts";
	const files = new Map([
		[
			configPath,
			'feature({ featureId: "seats", processors: { stripe: { productId: "prod_old" } } });',
		],
	]);
	expect(
		applyMappings({
			catalog: {
				features: [
					{ id: "seats", processors: { stripe: { productId: "prod_new" } } },
				],
			},
			configPath,
			files,
		}).unlocated,
	).toEqual([]);
	expect(files.get(configPath)).toContain("prod_new");
	expect(files.get(configPath)).not.toContain("prod_old");
	expect(
		applyMappings({
			catalog: { features: [{ id: "seats" }] },
			configPath,
			files,
		}).unlocated,
	).toEqual([]);
	expect(files.get(configPath)).not.toContain("processors");
});

test("ambiguous and computed item identity never receives a guessed mapping", () => {
	for (const source of [
		planSource.replace('interval: "year"', 'interval: "month"'),
		planSource.replace('featureId: "seats"', "featureId: featureName"),
	]) {
		const configPath = "/synthetic/autumn.config.ts";
		const files = new Map([[configPath, source]]);
		const result = applyMappings({
			catalog: { plans: [planRow] },
			configPath,
			files,
		});
		expect(result.unlocated.length).toBeGreaterThan(0);
		expect(files.get(configPath)).toBe(source);
	}
});

test("variant mappings use the generated response path and identity", () => {
	const configPath = "/synthetic/autumn.config.ts";
	const files = new Map([
		[
			configPath,
			`plan({ planId: "pro", variants: [variant({ variantPlanId: "annual" })] });`,
		],
	]);
	const result = applyMappings({
		catalog: {
			plans: [
				{
					id: "pro",
					variants: [
						{
							variantPlanId: "annual",
							mappingIdentity: '["annual"]',
							plan: { processors: { stripe: { productId: "prod_variant" } } },
						},
					],
				},
			],
		},
		configPath,
		files,
	});
	expect(result.unlocated).toEqual([]);
	expect(files.get(configPath)).toContain("prod_variant");
});

test("generated client carries server item identities through the splice", async () => {
	const fetch: typeof globalThis.fetch = Object.assign(
		async () =>
			Response.json({
				plans: [
					{
						id: "pro",
						items: [
							{
								feature_id: "seats",
								mapping_identity: '["seats","prepaid","month",1]',
								price: {
									billing_method: "prepaid",
									interval: "month",
									processors: { stripe: { price_id: "price_wire" } },
								},
							},
						],
					},
				],
			}),
		{ preconnect: () => {} },
	);
	const client = createClient({ secretKey: "synthetic_test_key", fetch });
	const catalog = await client.get({ include_versions: true });
	const configPath = "/synthetic/autumn.config.ts";
	const files = new Map([
		[
			configPath,
			'plan({ planId: "pro", items: [{ featureId: "seats", price: { billingMethod: "prepaid", interval: "month" } }] });',
		],
	]);
	const result = applyMappings({ catalog, configPath, files });
	expect(result.unlocated).toEqual([]);
	expect(result.replaced).toEqual(["pro@v1"]);
	expect(files.get(configPath)).toContain("price_wire");
});

test("pull includes mappings on an existing unchanged fixture without a diff", async () => {
	const dir = join(import.meta.dir, ".tmp", "pull-existing-mappings");
	mkdirSync(dir, { recursive: true });
	const configPath = join(dir, "autumn.config.ts");
	const source = `import { atmn } from "../../../src/generated/wire";
import { feature } from "../../../src/generated/features";
export default atmn({ features: [feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false })] });`;
	writeFileSync(configPath, source);
	const client = {
		diff: async () => ({ features: [{ featureId: "seats", action: "none" }] }),
		get: async () => ({
			features: [
				{
					id: "seats",
					name: "Seats",
					type: "metered",
					consumable: false,
					processors: { stripe: { productId: "prod_feature" } },
				},
			],
		}),
		previewUpdateOrganization: async () => ({ config: { changes: [] } }),
	} as unknown as AutumnClient;
	await runPull({ client, cwd: dir, write: () => {} });
	expect(readFileSync(configPath, "utf8")).toBe(source);
	const included = await runPull({
		client,
		cwd: dir,
		includeMappings: true,
		write: () => {},
	});
	expect(included.replaced).toEqual(["seats"]);
	const mapped = readFileSync(configPath, "utf8");
	expect(mapped).toContain("prod_feature");
	expect(
		(
			await runPull({
				client,
				cwd: dir,
				includeMappings: true,
				write: () => {},
			})
		).replaced,
	).toEqual([]);
	await runPull({ client, cwd: dir, write: () => {} });
	expect(readFileSync(configPath, "utf8")).toBe(mapped);
});
