import { AppEnv, organizations } from "@autumn/shared";
import { inArray, sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { ProductService } from "../src/internal/products/ProductService";

// Bench ProductService.listFull for catalogV2 product setup.
// Pass org id(s) and/or slug(s) via env — do not hardcode customer slugs here.
//
//   EXPLAIN_ORG_ID=... \
//   EXPLAIN_ORG_SLUGS=slug_a,slug_b \
//   infisical run --env=staging --recursive -- sh -c \
//     'EXPLAIN_DATABASE_URL="$DATABASE_V2_URL" bun run experiments/benchListFullProducts.ts'

const STATEMENT_TIMEOUT_MS = 60_000;
const BENCH_RUNS = 5;

const dbUrl = process.env.EXPLAIN_DATABASE_URL ?? "";
const maskedUrl = dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)";
if (!dbUrl) throw new Error("EXPLAIN_DATABASE_URL env var is required");
if (/autumn-prod|-prod-/i.test(dbUrl) && process.env.ALLOW_NON_STAGING !== "1") {
	throw new Error(`EXPLAIN_DATABASE_URL looks like prod (${maskedUrl}). Use staging.`);
}
if (
	dbUrl.includes("pg.psdb.cloud") &&
	!dbUrl.includes("zg829hpzvvkc") &&
	process.env.ALLOW_NON_STAGING !== "1"
) {
	throw new Error(
		`psdb URL is not the staging branch (zg829hpzvvkc): ${maskedUrl}`,
	);
}
console.log("target:", maskedUrl.slice(0, 90));

const env =
	process.env.EXPLAIN_APP_ENV === AppEnv.Sandbox ? AppEnv.Sandbox : AppEnv.Live;

const { db, client } = initDrizzle({ maxConnections: 4, databaseUrl: dbUrl });

const section = (title: string) => console.log(`\n=== ${title} ===`);

const timed = async <T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> => {
	const start = performance.now();
	const value = await run();
	return { ms: performance.now() - start, value };
};

const stats = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return {
		min: sorted[0].toFixed(1),
		median: sorted[Math.floor(sorted.length / 2)].toFixed(1),
		max: sorted[sorted.length - 1].toFixed(1),
	};
};

const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

const fmtBytes = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const resolveOrgTargets = async (): Promise<
	Array<{ orgId: string; label: string }>
> => {
	const orgIds = (process.env.EXPLAIN_ORG_ID ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const orgSlugs = (process.env.EXPLAIN_ORG_SLUGS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	if (orgIds.length === 0 && orgSlugs.length === 0) {
		throw new Error("Set EXPLAIN_ORG_ID and/or EXPLAIN_ORG_SLUGS");
	}

	const targets: Array<{ orgId: string; label: string }> = orgIds.map(
		(orgId) => ({ orgId, label: orgId }),
	);

	if (orgSlugs.length > 0) {
		const rows = await db.query.organizations.findMany({
			columns: { id: true, slug: true },
			where: inArray(organizations.slug, orgSlugs),
		});
		const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
		for (const slug of orgSlugs) {
			const orgId = bySlug.get(slug);
			if (!orgId) throw new Error(`No org found for slug from EXPLAIN_ORG_SLUGS`);
			targets.push({ orgId, label: orgId });
		}
	}

	return targets;
};

const sumCounts = (products: Awaited<ReturnType<typeof ProductService.listFull>>) => ({
	rows: products.length,
	prices: products.reduce((n, p) => n + (p.prices?.length ?? 0), 0),
	ents: products.reduce((n, p) => n + (p.entitlements?.length ?? 0), 0),
	licenses: products.reduce((n, p) => n + (p.licenses?.length ?? 0), 0),
	parentLicenses: products.reduce(
		(n, p) => n + (p.parent_plan_licenses?.length ?? 0),
		0,
	),
	withBase: products.filter((p) => p.base_product).length,
	variantEdges: products.reduce((n, p) => n + (p.variants?.length ?? 0), 0),
});

const benchOrg = async ({ orgId }: { orgId: string }) => {
	section(`org product shape (org ${orgId}, env ${env})`);
	const shape = await db.execute<Record<string, number>>(sql`
		SELECT
			count(*)::int AS product_rows,
			count(DISTINCT id)::int AS plan_ids,
			count(*) FILTER (WHERE archived)::int AS archived_rows,
			count(*) FILTER (WHERE base_internal_product_id IS NOT NULL)::int AS variant_rows,
			coalesce(max(version), 0)::int AS max_version,
			(SELECT count(*)::int
				FROM prices pr
				JOIN products p ON p.internal_id = pr.internal_product_id
				WHERE p.org_id = ${orgId} AND p.env = ${env}) AS prices,
			(SELECT count(*)::int
				FROM entitlements e
				JOIN products p ON p.internal_id = e.internal_product_id
				WHERE p.org_id = ${orgId} AND p.env = ${env}) AS entitlements,
			(SELECT count(*)::int
				FROM free_trials ft
				JOIN products p ON p.internal_id = ft.internal_product_id
				WHERE p.org_id = ${orgId} AND p.env = ${env}) AS free_trials,
			(SELECT count(*)::int
				FROM plan_license pl
				JOIN products p ON p.internal_id = pl.parent_internal_product_id
				WHERE p.org_id = ${orgId} AND p.env = ${env}
					AND pl.is_custom = false) AS plan_licenses
		FROM products
		WHERE org_id = ${orgId} AND env = ${env}
	`);
	console.table([...shape]);

	const versionHist = await db.execute<Record<string, number>>(sql`
		SELECT version, count(*)::int AS plans
		FROM products
		WHERE org_id = ${orgId} AND env = ${env}
		GROUP BY version
		ORDER BY version
	`);
	console.log("plans per version:");
	console.table([...versionHist]);

	const listLatest = () =>
		ProductService.listFull({
			db,
			orgId,
			env,
			skipCache: true,
		});
	const listAllVersions = () =>
		ProductService.listFull({
			db,
			orgId,
			env,
			returnAll: true,
			skipCache: true,
		});

	// Sample: one plan_id — catalog update of a single product.
	const samplePlanIdRow = await db.execute<{ id: string }>(sql`
		SELECT id
		FROM products
		WHERE org_id = ${orgId} AND env = ${env}
		ORDER BY version DESC
		LIMIT 1
	`);
	const samplePlanId = [...samplePlanIdRow][0]?.id;
	const listSample = samplePlanId
		? () =>
				ProductService.listFull({
					db,
					orgId,
					env,
					inIds: [samplePlanId],
					returnAll: true,
					skipCache: true,
				})
		: null;

	section("warm");
	await listLatest();
	await listAllVersions();
	if (listSample) await listSample();

	section(`bench (${BENCH_RUNS} runs, skipCache: true)`);
	const latestSamples: number[] = [];
	const allSamples: number[] = [];
	const sampleSamples: number[] = [];

	let latestProducts = await listLatest();
	let allProducts = await listAllVersions();
	let sampleProducts = listSample ? await listSample() : [];

	for (let run = 0; run < BENCH_RUNS; run++) {
		latestSamples.push((await timed(listLatest)).ms);
		allSamples.push((await timed(listAllVersions)).ms);
		if (listSample) {
			sampleSamples.push((await timed(listSample)).ms);
		}
	}
	latestProducts = await listLatest();
	allProducts = await listAllVersions();
	if (listSample) sampleProducts = await listSample();

	console.log("listFull latest-only (ms):", stats(latestSamples));
	console.log("listFull returnAll (ms):  ", stats(allSamples));
	if (sampleSamples.length > 0) {
		console.log(
			"listFull inIds=[1] returnAll (ms):",
			stats(sampleSamples),
			`plan_id=${samplePlanId}`,
		);
	}

	section("payload size (JSON.stringify of FullProduct[])");
	const latestBytes = jsonBytes(latestProducts);
	const allBytes = jsonBytes(allProducts);
	const sampleBytes = jsonBytes(sampleProducts);

	console.log("latest-only:", {
		...sumCounts(latestProducts),
		json: fmtBytes(latestBytes),
		bytes: latestBytes,
	});
	console.log("returnAll:  ", {
		...sumCounts(allProducts),
		json: fmtBytes(allBytes),
		bytes: allBytes,
	});
	if (samplePlanId) {
		console.log("inIds=[1] returnAll:", {
			...sumCounts(sampleProducts),
			json: fmtBytes(sampleBytes),
			bytes: sampleBytes,
		});
	}
	console.log(
		"returnAll / latest size ratio:",
		(allBytes / Math.max(latestBytes, 1)).toFixed(2) + "x",
	);
};

const main = async () => {
	await db.execute(sql.raw(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
	const targets = await resolveOrgTargets();
	for (const target of targets) {
		await benchOrg({ orgId: target.orgId });
	}
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => client.end());
