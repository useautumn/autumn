import { AppEnv, customers, entities, type ExternalProcessors } from "@autumn/shared";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { generateId } from "@server/utils/genUtils.js";
import chalk from "chalk";
import { and, eq, sql } from "drizzle-orm";
import { TEST_ORG_CONFIG } from "../setupTestUtils/createTestOrg.js";

loadLocalEnv();

const CONFIG = {
	totalCustomers: 1_000_000,
	totalEntities: 50_000,
	timeRangeDays: 730,
	batchSize: 5_000,
	burstClusterSize: 100,
	burstEveryNCustomers: 1_000,
	revenuecatRatio: 0.1,
	defaultEnv: AppEnv.Sandbox,
	seedMarkerName: "Pagination Benchmark Org",
} as const;

interface CliArgs {
	org_slug: string;
	skip_entities?: boolean;
	wipe?: boolean;
	count?: number;
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
			case "skip_entities":
				parsed.skip_entities = true;
				break;
			case "wipe":
				parsed.wipe = true;
				break;
			case "count":
				parsed.count = Number.parseInt(value, 10);
				break;
			default:
				console.error(chalk.red(`Unknown flag: --${key}`));
				console.log(
					chalk.yellow(
						"\nUsage: bun run scripts/seed/seedPaginationBenchmark.ts [--count=<n>] [--skip_entities] [--wipe] [--org_slug=<slug>]",
					),
				);
				process.exit(1);
		}
	}

	return parsed;
};

const resolveOrg = async ({
	db,
	slug,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	slug: string;
}) => {
	const org = await db.query.organizations.findFirst({
		where: (orgs, { eq }) => eq(orgs.slug, slug),
	});

	if (!org) {
		throw new Error(
			`Org '${slug}' not found. Create it manually first (we do not auto-create orgs to avoid polluting prod accidentally).`,
		);
	}

	return org;
};

const generateCreatedAt = ({
	index,
	rangeMs,
	startMs,
}: {
	index: number;
	rangeMs: number;
	startMs: number;
}): number => {
	const burstIndex = Math.floor(index / CONFIG.burstEveryNCustomers);
	const burstOffset = index % CONFIG.burstEveryNCustomers;

	if (burstOffset < CONFIG.burstClusterSize) {
		const burstSlot = burstIndex / (CONFIG.totalCustomers / CONFIG.burstEveryNCustomers);
		return Math.floor(startMs + burstSlot * rangeMs);
	}

	const monotonicSlot = index / CONFIG.totalCustomers;
	const jitter = (Math.random() - 0.5) * (rangeMs / CONFIG.totalCustomers) * 50;
	return Math.floor(startMs + monotonicSlot * rangeMs + jitter);
};

type CustomerRow = typeof customers.$inferInsert;

const generateCustomerRow = ({
	index,
	orgId,
	env,
	createdAt,
}: {
	index: number;
	orgId: string;
	env: AppEnv;
	createdAt: number;
}): CustomerRow => {
	const internalId = generateId("cus_int");
	const externalId = `cus_bench_${index.toString().padStart(8, "0")}`;
	const hasRevenuecat = Math.random() < CONFIG.revenuecatRatio;

	const processors = hasRevenuecat
		? ({
				revenuecat: {
					id: `rc_${index}`,
					app_user_id: `app_${index}`,
				},
			} as unknown as ExternalProcessors)
		: ({} as ExternalProcessors);

	return {
		internal_id: internalId,
		org_id: orgId,
		created_at: createdAt,
		name: `Customer ${index}`,
		id: externalId,
		email: `bench+${index}@autumn-test.dev`,
		env,
		processors,
	};
};

const wipeExistingSeed = async ({
	db,
	orgId,
	env,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	orgId: string;
	env: AppEnv;
}) => {
	console.log(chalk.cyan("Wiping existing benchmark seed for this org..."));

	await db.execute(sql`
		DELETE FROM entities
		WHERE org_id = ${orgId}
			AND env = ${env}
			AND id LIKE 'ent_bench_%'
	`);

	await db.execute(sql`
		DELETE FROM customers
		WHERE org_id = ${orgId}
			AND env = ${env}
			AND id LIKE 'cus_bench_%'
	`);

	console.log(chalk.green("✅ Wipe complete"));
};

const seedCustomers = async ({
	db,
	orgId,
	env,
	count,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	orgId: string;
	env: AppEnv;
	count: number;
}) => {
	const now = Date.now();
	const rangeMs = CONFIG.timeRangeDays * 24 * 60 * 60 * 1000;
	const startMs = now - rangeMs;

	console.log(
		chalk.cyan(
			`Seeding ${count.toLocaleString()} customers (${CONFIG.timeRangeDays}-day range, batch=${CONFIG.batchSize})...`,
		),
	);

	const startedAt = performance.now();
	let inserted = 0;

	for (let batchStart = 0; batchStart < count; batchStart += CONFIG.batchSize) {
		const batchEnd = Math.min(batchStart + CONFIG.batchSize, count);
		const rows: CustomerRow[] = [];

		for (let i = batchStart; i < batchEnd; i++) {
			rows.push(
				generateCustomerRow({
					index: i,
					orgId,
					env,
					createdAt: generateCreatedAt({ index: i, rangeMs, startMs }),
				}),
			);
		}

		await db.insert(customers).values(rows);
		inserted += rows.length;

		const pct = ((inserted / count) * 100).toFixed(1);
		const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
		process.stdout.write(
			`\r  ${chalk.gray(`${inserted.toLocaleString()} / ${count.toLocaleString()} (${pct}%) — ${elapsed}s`)}`,
		);
	}

	const totalElapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
	console.log(chalk.green(`\n✅ Inserted ${inserted.toLocaleString()} customers in ${totalElapsed}s`));
};

type EntityRow = typeof entities.$inferInsert;

const seedEntities = async ({
	db,
	orgId,
	env,
	customerCount,
	entityCount,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	orgId: string;
	env: AppEnv;
	customerCount: number;
	entityCount: number;
}) => {
	console.log(
		chalk.cyan(
			`Seeding ${entityCount.toLocaleString()} entities across ${customerCount.toLocaleString()} customers...`,
		),
	);

	const sample = await db
		.select({ internal_id: customers.internal_id })
		.from(customers)
		.where(and(eq(customers.org_id, orgId), eq(customers.env, env)))
		.limit(customerCount);

	if (sample.length === 0) {
		console.log(chalk.yellow("⚠️  No customers found, skipping entity seed"));
		return;
	}

	const now = Date.now();
	const rangeMs = CONFIG.timeRangeDays * 24 * 60 * 60 * 1000;
	const startMs = now - rangeMs;

	const startedAt = performance.now();
	let inserted = 0;

	for (let batchStart = 0; batchStart < entityCount; batchStart += CONFIG.batchSize) {
		const batchEnd = Math.min(batchStart + CONFIG.batchSize, entityCount);
		const rows: EntityRow[] = [];

		for (let i = batchStart; i < batchEnd; i++) {
			const customer = sample[i % sample.length];
			rows.push({
				internal_id: generateId("ent_int"),
				id: `ent_bench_${i.toString().padStart(8, "0")}`,
				org_id: orgId,
				env,
				internal_customer_id: customer.internal_id,
				created_at: Math.floor(startMs + (i / entityCount) * rangeMs),
				name: `Entity ${i}`,
				deleted: false,
			});
		}

		await db.insert(entities).values(rows);
		inserted += rows.length;

		const pct = ((inserted / entityCount) * 100).toFixed(1);
		const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
		process.stdout.write(
			`\r  ${chalk.gray(`${inserted.toLocaleString()} / ${entityCount.toLocaleString()} (${pct}%) — ${elapsed}s`)}`,
		);
	}

	const totalElapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
	console.log(
		chalk.green(`\n✅ Inserted ${inserted.toLocaleString()} entities in ${totalElapsed}s`),
	);
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			"\n================ Pagination Benchmark Seed ================\n",
		),
	);

	const args = parseArgs();
	const env = CONFIG.defaultEnv;
	const customerCount = args.count ?? CONFIG.totalCustomers;
	const entityCount = Math.min(
		CONFIG.totalEntities,
		Math.floor(customerCount * 0.05),
	);

	const { db, client } = initDrizzle();

	try {
		const org = await resolveOrg({ db, slug: args.org_slug });

		console.log(chalk.cyan("Target:"));
		console.log(chalk.gray(`  Org: ${org.slug} (${org.id})`));
		console.log(chalk.gray(`  Env: ${env}`));
		console.log(chalk.gray(`  Customers: ${customerCount.toLocaleString()}`));
		if (!args.skip_entities) {
			console.log(chalk.gray(`  Entities: ${entityCount.toLocaleString()}`));
		}
		console.log();

		if (args.wipe) {
			await wipeExistingSeed({ db, orgId: org.id, env });
			console.log();
		}

		const existing = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(customers)
			.where(
				and(
					eq(customers.org_id, org.id),
					eq(customers.env, env),
					sql`${customers.id} LIKE 'cus_bench_%'`,
				),
			);

		const existingCount = existing[0]?.count ?? 0;
		if (existingCount > 0 && !args.wipe) {
			console.log(
				chalk.yellow(
					`⚠️  Found ${existingCount.toLocaleString()} existing bench customers. Re-run with --wipe to reset, or skip seeding.`,
				),
			);
			if (existingCount >= customerCount) {
				console.log(chalk.green("✅ Seed already satisfies target count — exiting."));
				return;
			}
			console.log(chalk.yellow(`Continuing seed to fill remaining ${(customerCount - existingCount).toLocaleString()} customers.`));
		}

		await seedCustomers({ db, orgId: org.id, env, count: customerCount });

		if (!args.skip_entities) {
			await seedEntities({
				db,
				orgId: org.id,
				env,
				customerCount,
				entityCount,
			});
		}

		console.log(
			chalk.magentaBright(
				"\n================ Seed Complete ================\n",
			),
		);
	} catch (error) {
		console.error(chalk.red("\n❌ Seed failed:"));
		if (error instanceof Error) {
			console.error(chalk.red(`   ${error.message}`));
			console.error(chalk.gray(error.stack));
		} else {
			console.error(chalk.red(`   ${String(error)}`));
		}
		process.exit(1);
	} finally {
		await client.end();
	}
};

await main();
process.exit(0);
