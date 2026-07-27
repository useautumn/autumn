// Seeds N fat customers on the dev DB by cloning a template customer, so the
// planner sees prod-like row shapes. All rows use a `bench_` id prefix.
//
//   ENV_FILE=.env infisical run --env=dev --recursive -- \
//     bun experiments/seedBenchCustomers.ts [count] [usageWindowsPerCustomer]
//
// Cleanup: bun experiments/seedBenchCustomers.ts --clean
import pg from "pg";

const TEMPLATE_CUSTOMER = "cus_3GXT6xOPn4Txwvpw5cfJA6pyJoG";
const PREFIX = "bench_";

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const count = Number(args[0]) || 100;
const windowsPerCustomer = Number(args[1]) || 4;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const pool = new pg.Pool({ connectionString: url, max: 4 });

const q = async (text: string, values: unknown[] = []) => {
	const res = await pool.query(text, values);
	return res.rowCount ?? 0;
};

/** Clone a row set, overriding columns via a jsonb patch. Column-agnostic. */
const cloneSql = (table: string, patch: string, from: string) =>
	`INSERT INTO ${table}
	 SELECT (jsonb_populate_record(NULL::${table}, to_jsonb(t) || ${patch})).*
	 FROM ${from}
	 ON CONFLICT DO NOTHING`;

const cleanup = async () => {
	// Children first — FKs cascade on some paths but not all.
	for (const [table, col] of [
		["usage_windows", "internal_customer_id"],
		["customer_prices", "id"],
		["customer_entitlements", "id"],
		["customer_products", "id"],
		["customers", "internal_id"],
	] as const) {
		const n = await q(`DELETE FROM ${table} WHERE ${col} LIKE '${PREFIX}%'`);
		console.log(`  deleted ${n} from ${table}`);
	}
};

const seed = async () => {
	const series = `generate_series(1, ${count}) i`;

	console.log(`Cloning ${TEMPLATE_CUSTOMER} × ${count}...`);

	const customers = await q(
		cloneSql(
			"customers",
			`jsonb_build_object(
				'internal_id', '${PREFIX}cus_'||i,
				'id', '${PREFIX}'||i,
				'name', 'Bench Customer '||i,
				'email', 'bench+'||i||'@example.test')`,
			`customers t, ${series} WHERE t.internal_id = '${TEMPLATE_CUSTOMER}'`,
		),
	);
	console.log(`  customers: ${customers}`);

	const products = await q(
		cloneSql(
			"customer_products",
			`jsonb_build_object(
				'id', '${PREFIX}cp_'||i||'_'||t.id,
				'internal_customer_id', '${PREFIX}cus_'||i)`,
			`customer_products t, ${series} WHERE t.internal_customer_id = '${TEMPLATE_CUSTOMER}'`,
		),
	);
	console.log(`  customer_products: ${products}`);

	const entitlements = await q(
		cloneSql(
			"customer_entitlements",
			`jsonb_build_object(
				'id', '${PREFIX}ce_'||i||'_'||t.id,
				'internal_customer_id', '${PREFIX}cus_'||i,
				'customer_product_id', CASE WHEN t.customer_product_id IS NULL THEN NULL
					ELSE '${PREFIX}cp_'||i||'_'||t.customer_product_id END)`,
			`customer_entitlements t, ${series} WHERE t.internal_customer_id = '${TEMPLATE_CUSTOMER}'`,
		),
	);
	console.log(`  customer_entitlements: ${entitlements}`);

	const prices = await q(
		cloneSql(
			"customer_prices",
			`jsonb_build_object(
				'id', '${PREFIX}cpr_'||i||'_'||t.id,
				'customer_product_id', '${PREFIX}cp_'||i||'_'||t.customer_product_id)`,
			`customer_prices t
			 JOIN customer_products cp ON cp.id = t.customer_product_id
			 , ${series}
			 WHERE cp.internal_customer_id = '${TEMPLATE_CUSTOMER}'`,
		),
	);
	console.log(`  customer_prices: ${prices}`);

	// usage_windows has no template rows — synthesise from each customer's ents.
	const windows = await q(
		`INSERT INTO usage_windows (
			id, internal_customer_id, internal_entity_id, feature_id,
			internal_feature_id, filter_key, anchor_customer_entitlement_id,
			window_start_at, window_end_at, usage, updated_at)
		 SELECT '${PREFIX}uw_'||ce.id||'_'||w,
		        ce.internal_customer_id,
		        NULL,
		        COALESCE(ce.feature_id, ce.internal_feature_id),
		        ce.internal_feature_id,
		        NULL,
		        ce.id,
		        (EXTRACT(EPOCH FROM now()) * 1000)::bigint - (w * 3600000),
		        (EXTRACT(EPOCH FROM now()) * 1000)::bigint - ((w - 1) * 3600000),
		        (w * 10)::numeric,
		        (EXTRACT(EPOCH FROM now()) * 1000)::bigint
		 FROM customer_entitlements ce, generate_series(1, ${windowsPerCustomer}) w
		 WHERE ce.internal_customer_id LIKE '${PREFIX}%'
		   AND ce.customer_product_id IS NOT NULL
		 ON CONFLICT DO NOTHING`,
	);
	console.log(`  usage_windows: ${windows}`);
};

try {
	if (clean) {
		console.log("Cleaning bench rows...");
		await cleanup();
	} else {
		await seed();
		const { rows } = await pool.query(
			`SELECT
				(SELECT count(*) FROM customers WHERE internal_id LIKE '${PREFIX}%') AS customers,
				(SELECT count(*) FROM customer_products WHERE id LIKE '${PREFIX}%') AS products,
				(SELECT count(*) FROM customer_entitlements WHERE id LIKE '${PREFIX}%') AS entitlements,
				(SELECT count(*) FROM customer_prices WHERE id LIKE '${PREFIX}%') AS prices,
				(SELECT count(*) FROM usage_windows WHERE id LIKE '${PREFIX}%') AS usage_windows`,
		);
		console.log("\nTotals:", rows[0]);
	}
} finally {
	await pool.end();
}
