import {
	AppEnv,
	customerEntitlements,
	customerPrices,
	customerProducts,
	type Entitlement,
	type FreeTrial,
	type InsertCustomerEntitlement,
	type InsertCustomerProduct,
	type Product,
	rollovers,
} from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { generateId } from "@server/utils/genUtils.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { TEST_ORG_CONFIG } from "../setupTestUtils/createTestOrg.js";

loadLocalEnv();

const CONFIG = {
	batchSize: 2000,
	rolloverRatio: 0.15,
	looseCeRatio: 0.2,
	shapes: [
		{ name: "empty", weight: 40 },
		{ name: "single_main", weight: 30 },
		{ name: "main_plus_addon", weight: 15 },
		{ name: "main_with_trial", weight: 10 },
		{ name: "power_user", weight: 5 },
	] as const,
} as const;

type ShapeName = (typeof CONFIG.shapes)[number]["name"];

interface CliArgs {
	org_slug: string;
	wipe?: boolean;
	limit?: number;
	start_offset?: number;
	skip_seeded_check?: boolean;
	resume?: boolean;
}

const parseArgs = (): CliArgs => {
	const args = process.argv.slice(2);
	const parsed: CliArgs = { org_slug: TEST_ORG_CONFIG.slug };
	for (const arg of args) {
		if (!arg.startsWith("--")) continue;
		const [key, value] = arg.slice(2).split("=");
		switch (key) {
			case "org_slug":
				parsed.org_slug = value;
				break;
			case "wipe":
				parsed.wipe = true;
				break;
			case "limit":
				parsed.limit = Number.parseInt(value, 10);
				break;
			case "start_offset":
				parsed.start_offset = Number.parseInt(value, 10);
				break;
			case "skip_seeded_check":
				parsed.skip_seeded_check = true;
				break;
			case "resume":
				parsed.resume = true;
				break;
			default:
				console.error(chalk.red(`Unknown flag: --${key}`));
				process.exit(1);
		}
	}
	return parsed;
};

const weightedPick = <T extends { weight: number; name: string }>(
	choices: readonly T[],
): T => {
	const total = choices.reduce((s, c) => s + c.weight, 0);
	let r = Math.random() * total;
	for (const c of choices) {
		r -= c.weight;
		if (r <= 0) return c;
	}
	return choices[choices.length - 1];
};

const randInt = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min: number, max: number) =>
	Math.random() * (max - min) + min;
const pick = <T>(arr: readonly T[]): T =>
	arr[Math.floor(Math.random() * arr.length)];

const main = async () => {
	console.log(
		chalk.magentaBright(
			"\n================ Seed Customer Products / Entitlements ================\n",
		),
	);
	const args = parseArgs();
	const env = AppEnv.Sandbox;
	const { db, client } = initDrizzle();

	try {
		const org = await db.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.slug, args.org_slug),
		});
		if (!org) throw new Error(`Org '${args.org_slug}' not found`);
		console.log(chalk.cyan(`Org: ${org.slug} (${org.id})`));

		if (args.wipe) {
			console.log(chalk.cyan("Wiping existing bench cps/ces/rollovers..."));
			await db.execute(sql`
				DELETE FROM rollovers WHERE cus_ent_id IN (
					SELECT ce.id FROM customer_entitlements ce
					JOIN customers c ON c.internal_id = ce.internal_customer_id
					WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
				)
			`);
			await db.execute(sql`
				DELETE FROM customer_entitlements ce
				USING customers c
				WHERE c.internal_id = ce.internal_customer_id
					AND c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
			`);
			await db.execute(sql`
				DELETE FROM customer_prices cpr
				USING customer_products cp, customers c
				WHERE cpr.customer_product_id = cp.id
					AND cp.internal_customer_id = c.internal_id
					AND c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
			`);
			await db.execute(sql`
				DELETE FROM customer_products cp
				USING customers c
				WHERE c.internal_id = cp.internal_customer_id
					AND c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
			`);
			console.log(chalk.green("✅ Wipe complete\n"));
		}

		const products = (await db.execute(sql`
			SELECT p.internal_id, p.id, p.is_add_on, p.is_default, p.group, p.created_at
			FROM products p
			WHERE p.org_id = ${org.id}
				AND p.archived = false
				AND EXISTS (
					SELECT 1 FROM entitlements e WHERE e.internal_product_id = p.internal_id
				)
			ORDER BY p.created_at
		`)) as unknown as Array<
			Pick<
				Product,
				| "internal_id"
				| "id"
				| "is_add_on"
				| "is_default"
				| "group"
				| "created_at"
			>
		>;

		const mainProducts = products.filter((p) => !p.is_add_on);
		const addonProducts = products.filter((p) => p.is_add_on);

		console.log(
			chalk.gray(
				`  ${mainProducts.length} main products, ${addonProducts.length} addons (must have at least 1 entitlement)`,
			),
		);
		if (mainProducts.length === 0)
			throw new Error("No main products to seed with");

		const allEnts = (await db.execute(sql`
			SELECT e.id, e.internal_product_id, e.internal_feature_id, e.allowance,
				e.allowance_type, e.interval, e.interval_count, e.usage_limit,
				e.entity_feature_id, e.rollover, e.feature_id
			FROM entitlements e
			JOIN products p ON p.internal_id = e.internal_product_id
			WHERE p.org_id = ${org.id} AND p.archived = false
		`)) as unknown as Array<
			Pick<
				Entitlement,
				| "id"
				| "internal_product_id"
				| "internal_feature_id"
				| "allowance"
				| "allowance_type"
				| "interval"
				| "interval_count"
				| "usage_limit"
				| "entity_feature_id"
				| "rollover"
				| "feature_id"
			>
		>;
		const entsByProduct = new Map<string, typeof allEnts>();
		for (const e of allEnts) {
			if (!e.internal_product_id) continue;
			const list = entsByProduct.get(e.internal_product_id) ?? [];
			list.push(e);
			entsByProduct.set(e.internal_product_id, list);
		}
		console.log(
			chalk.gray(`  ${allEnts.length} entitlements across products\n`),
		);

		const freeTrials = (await db.execute(sql`
			SELECT id, internal_product_id, length, duration FROM free_trials
		`)) as unknown as Array<
			Pick<FreeTrial, "id" | "internal_product_id"> & {
				length: number;
				duration: string;
			}
		>;
		const trialsByProduct = new Map<string, typeof freeTrials>();
		for (const ft of freeTrials) {
			const list = trialsByProduct.get(ft.internal_product_id) ?? [];
			list.push(ft);
			trialsByProduct.set(ft.internal_product_id, list);
		}

		const features = (await db.execute(sql`
			SELECT internal_id, id, type FROM features
			WHERE org_id = ${org.id} AND archived = false
		`)) as unknown as Array<{ internal_id: string; id: string; type: string }>;
		const meteredFeatures = features.filter((f) => f.type !== "boolean");

		const seededHas = await db.execute(sql`
			SELECT COUNT(*)::int AS n FROM customer_products cp
			JOIN customers c ON c.internal_id = cp.internal_customer_id
			WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
		`);
		const existing = (seededHas as unknown as { n: number }[])[0].n;
		if (existing > 0 && !args.skip_seeded_check && !args.wipe) {
			console.log(
				chalk.yellow(
					`⚠️  ${existing.toLocaleString()} bench customer_products already exist. Re-run with --wipe to reset, or --skip_seeded_check to add more.`,
				),
			);
			return;
		}

		const customersToSeed = (await db.execute(sql`
			SELECT c.internal_id, c.id, c.created_at
			FROM customers c
			WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%'
			ORDER BY c.created_at
			${args.limit ? sql`LIMIT ${args.limit}` : sql``}
		`)) as unknown as Array<{
			internal_id: string;
			id: string;
			created_at: number;
		}>;

		console.log(
			chalk.cyan(
				`Seeding cp/ce/rollover/cprice across ${customersToSeed.length.toLocaleString()} cus_bench_* customers`,
			),
		);

		const shapeCounts: Record<ShapeName, number> = {
			empty: 0,
			single_main: 0,
			main_plus_addon: 0,
			main_with_trial: 0,
			power_user: 0,
		};
		const cpRows: InsertCustomerProduct[] = [];
		const ceRows: InsertCustomerEntitlement[] = [];
		const rolloverRows: Array<typeof rollovers.$inferInsert>[number][] = [];
		const cprRows: Array<typeof customerPrices.$inferInsert>[number][] = [];
		let looseCeCount = 0;

		const startedAt = performance.now();

		for (const cus of customersToSeed) {
			const shape = weightedPick(CONFIG.shapes).name;
			shapeCounts[shape]++;
			if (shape === "empty") continue;

			const mainProd = pick(mainProducts);
			const startsAt = cus.created_at + randInt(60_000, 86_400_000);
			const cpsForThisCustomer: Array<{
				cpId: string;
				prod: typeof mainProd;
				isAddon: boolean;
				trialEndsAt: number | null;
				freeTrialId: string | null;
			}> = [];

			cpsForThisCustomer.push({
				cpId: generateId("cus_prod"),
				prod: mainProd,
				isAddon: false,
				trialEndsAt: null,
				freeTrialId: null,
			});

			if (shape === "main_plus_addon" || shape === "power_user") {
				const addonCount = shape === "power_user" ? randInt(2, 3) : 1;
				const shuffledAddons = [...addonProducts].sort(
					() => Math.random() - 0.5,
				);
				for (let i = 0; i < Math.min(addonCount, shuffledAddons.length); i++) {
					cpsForThisCustomer.push({
						cpId: generateId("cus_prod"),
						prod: shuffledAddons[i],
						isAddon: true,
						trialEndsAt: null,
						freeTrialId: null,
					});
				}
			}

			if (shape === "main_with_trial") {
				const trials = trialsByProduct.get(mainProd.internal_id);
				if (trials && trials.length > 0) {
					const trial = pick(trials);
					const trialEndsAt =
						startsAt + (trial.length ?? 7) * 24 * 60 * 60 * 1000;
					cpsForThisCustomer[0].trialEndsAt = trialEndsAt;
					cpsForThisCustomer[0].freeTrialId = trial.id;
				}
			}

			for (const cpEntry of cpsForThisCustomer) {
				const subId = `sub_${cpEntry.cpId}`;
				cpRows.push({
					id: cpEntry.cpId,
					internal_customer_id: cus.internal_id,
					internal_product_id: cpEntry.prod.internal_id,
					product_id: cpEntry.prod.id,
					customer_id: cus.id,
					created_at: startsAt,
					starts_at: startsAt,
					status: cpEntry.trialEndsAt ? "trialing" : "active",
					processor: { type: "stripe", id: subId },
					subscription_ids: [subId],
					scheduled_ids: [],
					quantity: cpEntry.isAddon ? randInt(1, 5) : 1,
					is_custom: false,
					canceled: false,
					trial_ends_at: cpEntry.trialEndsAt,
					free_trial_id: cpEntry.freeTrialId,
					api_version: 23,
					api_semver: "2.3.0",
					billing_version: "v2",
					collection_method: "charge_automatically",
				});

				cprRows.push({
					id: generateId("cus_price"),
					created_at: startsAt,
					price_id: null,
					internal_customer_id: cus.internal_id,
					customer_product_id: cpEntry.cpId,
				});

				const prodEnts = entsByProduct.get(cpEntry.prod.internal_id) ?? [];
				for (const ent of prodEnts) {
					const isUnlimited = ent.allowance_type === "unlimited";
					const isBoolean = ent.allowance_type === null;
					const allowance = Number(ent.allowance ?? 0);
					const balance = isUnlimited
						? 0
						: isBoolean
							? 0
							: Math.max(0, allowance - randInt(0, Math.max(1, allowance)));
					const nextResetAt =
						ent.interval && ent.interval !== "lifetime"
							? startsAt + 30 * 24 * 60 * 60 * 1000
							: null;
					const ceId = generateId("cus_ent");
					ceRows.push({
						id: ceId,
						customer_product_id: cpEntry.cpId,
						entitlement_id: ent.id,
						internal_customer_id: cus.internal_id,
						internal_feature_id: ent.internal_feature_id,
						customer_id: cus.id,
						feature_id: ent.feature_id,
						unlimited: isUnlimited,
						balance,
						additional_balance: 0,
						adjustment: 0,
						created_at: startsAt,
						next_reset_at: nextResetAt,
						usage_allowed: ent.usage_limit != null,
						entities: null,
						cache_version: 0,
					});

					if (
						!isBoolean &&
						!isUnlimited &&
						allowance > 0 &&
						Math.random() < CONFIG.rolloverRatio
					) {
						rolloverRows.push({
							id: generateId("rollover"),
							cus_ent_id: ceId,
							balance: randFloat(0, allowance * 0.5),
							expires_at: startsAt + 60 * 24 * 60 * 60 * 1000,
							entities: {},
							usage: randFloat(0, allowance * 0.2),
						});
					}
				}
			}

			if (
				(shape === "power_user" || Math.random() < CONFIG.looseCeRatio) &&
				meteredFeatures.length > 0
			) {
				const looseCount = shape === "power_user" ? randInt(2, 4) : 1;
				const used = new Set<string>();
				for (let i = 0; i < looseCount; i++) {
					const feat = pick(meteredFeatures);
					if (used.has(feat.internal_id)) continue;
					used.add(feat.internal_id);
					const looseAllowance = randInt(50, 500);
					ceRows.push({
						id: generateId("cus_ent"),
						customer_product_id: null,
						entitlement_id: pick(allEnts).id,
						internal_customer_id: cus.internal_id,
						internal_feature_id: feat.internal_id,
						customer_id: cus.id,
						feature_id: feat.id,
						unlimited: false,
						balance: randInt(0, looseAllowance),
						additional_balance: 0,
						adjustment: 0,
						created_at: startsAt,
						next_reset_at: null,
						usage_allowed: false,
						entities: null,
						cache_version: 0,
					});
					looseCeCount++;
				}
			}

			if (cpRows.length >= CONFIG.batchSize) {
				await flush({ db, cpRows, ceRows, cprRows, rolloverRows });
			}
		}

		await flush({ db, cpRows, ceRows, cprRows, rolloverRows });

		const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
		console.log(chalk.green(`\n✅ Done in ${elapsed}s`));
		console.log(chalk.bold("\nShape distribution:"));
		for (const [name, count] of Object.entries(shapeCounts)) {
			const pct = ((count / customersToSeed.length) * 100).toFixed(1);
			console.log(
				`  ${name.padEnd(20)} ${count.toLocaleString().padStart(8)}  (${pct}%)`,
			);
		}
		console.log(
			chalk.gray(`  loose ces inserted:  ${looseCeCount.toLocaleString()}`),
		);

		const finalStats = await db.execute(sql`
			SELECT
				(SELECT COUNT(*)::int FROM customer_products cp JOIN customers c ON c.internal_id = cp.internal_customer_id WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%') AS cps,
				(SELECT COUNT(*)::int FROM customer_entitlements ce JOIN customers c ON c.internal_id = ce.internal_customer_id WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%') AS ces,
				(SELECT COUNT(*)::int FROM customer_prices cpr JOIN customer_products cp ON cp.id = cpr.customer_product_id JOIN customers c ON c.internal_id = cp.internal_customer_id WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%') AS cprs,
				(SELECT COUNT(*)::int FROM rollovers ro JOIN customer_entitlements ce ON ce.id = ro.cus_ent_id JOIN customers c ON c.internal_id = ce.internal_customer_id WHERE c.org_id = ${org.id} AND c.env = ${env} AND c.id LIKE 'cus_bench_%') AS rollovers
		`);
		const totals = (finalStats as unknown as Record<string, number>[])[0];
		console.log(chalk.bold("\nDB totals after seed (cus_bench_* only):"));
		for (const [k, v] of Object.entries(totals)) {
			console.log(
				`  ${k.padEnd(20)} ${Number(v).toLocaleString().padStart(8)}`,
			);
		}
	} catch (e) {
		console.error(chalk.red("\n❌ Seed failed:"));
		if (e instanceof Error) {
			console.error(chalk.red(`   ${e.message}`));
			console.error(chalk.gray(e.stack));
		} else {
			console.error(chalk.red(`   ${String(e)}`));
		}
		process.exit(1);
	} finally {
		await client.end();
	}
};

const chunk = <T>(arr: T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
};

const flush = async ({
	db,
	cpRows,
	ceRows,
	cprRows,
	rolloverRows,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	cpRows: InsertCustomerProduct[];
	ceRows: InsertCustomerEntitlement[];
	cprRows: Array<typeof customerPrices.$inferInsert>;
	rolloverRows: Array<typeof rollovers.$inferInsert>;
}) => {
	for (const batch of chunk(cpRows, 1000))
		await db.insert(customerProducts).values(batch);
	for (const batch of chunk(cprRows, 1000))
		await db.insert(customerPrices).values(batch);
	for (const batch of chunk(ceRows, 1000))
		await db.insert(customerEntitlements).values(batch);
	for (const batch of chunk(rolloverRows, 1000))
		await db.insert(rollovers).values(batch);
	const total =
		cpRows.length + ceRows.length + cprRows.length + rolloverRows.length;
	process.stdout.write(
		chalk.gray(
			`\r  flushed ${cpRows.length.toLocaleString()} cp, ${ceRows.length.toLocaleString()} ce, ${cprRows.length.toLocaleString()} cpr, ${rolloverRows.length.toLocaleString()} ro (total ${total.toLocaleString()})`,
		),
	);
	cpRows.length = 0;
	ceRows.length = 0;
	cprRows.length = 0;
	rolloverRows.length = 0;
};

await main();
process.exit(0);
