import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { orgEnvWhere } from "../lib/sqlString.js";
import { querySql } from "../lib/tinybirdHttp.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";
import { collectPipeChecks } from "./pipeChecks.js";

type Check = {
	label: string;
	expected: number;
	actual: number;
	tolerance: number;
};

const RAW_CHUNK_DAYS = 7;
const PROPERTY_MV_PIPE = resolve(
	import.meta.dir,
	"../../../materializations/events_property_mv_pipe.pipe",
);

/** The rollup's value-shape gate, read from the datafile so the raw comparison can't drift from it. */
const propertyGateSql = () => {
	const text = readFileSync(PROPERTY_MV_PIPE, "utf8");
	const match = text
		.slice(text.indexOf("SQL >"))
		.match(/\bWHERE\b([\s\S]+?)\bGROUP BY\b/);
	if (!match)
		throw new Error(
			`Could not find the property gate WHERE in ${PROPERTY_MV_PIPE}`,
		);
	return match[1].trim();
};

const toNumber = (value: unknown) => Number(value ?? 0);

const scalar = async ({
	target,
	sql,
}: {
	target: TinybirdTarget;
	sql: string;
}) => toNumber(Object.values((await querySql({ target, sql }))[0] ?? {})[0]);

const keyed = async ({
	target,
	sql,
}: {
	target: TinybirdTarget;
	sql: string;
}) => {
	const out = new Map<string, number>();
	for (const row of await querySql<{ k: string; c: unknown }>({
		target,
		sql,
	})) {
		out.set(row.k, (out.get(row.k) ?? 0) + toNumber(row.c));
	}
	return out;
};

/** Raw scans run per week so each /v0/sql call stays under Local's 10s cap on big seeds. */
const rawChunks = async ({
	target,
	where,
}: {
	target: TinybirdTarget;
	where: string;
}) => {
	const [bounds] = await querySql<{ lo: string; hi: string; n: unknown }>({
		target,
		sql: `SELECT toUnixTimestamp(min(timestamp)) lo, toUnixTimestamp(max(timestamp)) + 1 hi, count() n FROM events WHERE ${where}`,
	});
	if (!toNumber(bounds?.n)) return [];
	const chunks: string[] = [];
	const step = RAW_CHUNK_DAYS * 86_400;
	for (let lo = Number(bounds.lo); lo < Number(bounds.hi); lo += step) {
		chunks.push(
			`timestamp >= toDateTime(${lo}) AND timestamp < toDateTime(${Math.min(lo + step, Number(bounds.hi))})`,
		);
	}
	return chunks;
};

const sumOverChunks = async ({
	target,
	chunks,
	build,
}: {
	target: TinybirdTarget;
	chunks: string[];
	build: (chunk: string) => string;
}) => {
	const total = new Map<string, number>();
	for (const chunk of chunks) {
		for (const [k, v] of await keyed({ target, sql: build(chunk) }))
			total.set(k, (total.get(k) ?? 0) + v);
	}
	return total;
};

const collectChecks = async ({
	target,
	orgId,
	env,
}: {
	target: TinybirdTarget;
	orgId: string;
	env: string;
}) => {
	const where = orgEnvWhere({ orgId, env });
	const chunks = await rawChunks({ target, where });
	const raw = await sumOverChunks({
		target,
		chunks,
		build: (chunk) =>
			`SELECT arrayJoin([('count', toFloat64(count())), ('value', sum(toFloat64(coalesce(value, 1)))), ('entity', toFloat64(countIf(coalesce(entity_id, '') != '')))]) t, t.1 k, t.2 c FROM events WHERE ${where} AND ${chunk}`,
	});
	const rawCount = raw.get("count") ?? 0;
	const rawValue = raw.get("value") ?? 0;
	const rawEntity = raw.get("entity") ?? 0;

	const gated = await sumOverChunks({
		target,
		chunks,
		build: (chunk) =>
			`SELECT kv.1 k, count() c FROM events ARRAY JOIN JSONExtractKeysAndValues(properties::String, 'String') AS kv WHERE ${where} AND ${chunk} AND ${propertyGateSql()} GROUP BY k`,
	});
	const present = await sumOverChunks({
		target,
		chunks,
		build: (chunk) =>
			`SELECT kv.1 k, count() c FROM events ARRAY JOIN JSONExtractKeysAndValues(properties::String, 'String') AS kv WHERE ${where} AND ${chunk} AND kv.2 != '' GROUP BY k`,
	});

	const count = (label: string, expected: number, sql: string) =>
		scalar({ target, sql }).then((actual) => ({
			label,
			expected,
			actual,
			tolerance: 0,
		}));
	const value = (label: string, sql: string) =>
		scalar({ target, sql }).then((actual) => ({
			label,
			expected: rawValue,
			actual,
			tolerance: Math.max(1e-6, Math.abs(rawValue) * 1e-9),
		}));
	const dim = (dimension: string) => `${where} AND dimension = '${dimension}'`;

	const checks: Check[] = await Promise.all([
		count(
			"events_customer_hourly_mv",
			rawCount,
			`SELECT sum(event_count) FROM events_customer_hourly_mv WHERE ${where}`,
		),
		count(
			"events_customer_daily_mv",
			rawCount,
			`SELECT sumMerge(event_count) FROM events_customer_daily_mv WHERE ${where}`,
		),
		count(
			"events_customer_monthly_mv",
			rawCount,
			`SELECT sumMerge(event_count) FROM events_customer_monthly_mv WHERE ${where}`,
		),
		count(
			"events_org_hourly_mv",
			rawCount,
			`SELECT sum(event_count) FROM events_org_hourly_mv WHERE ${where}`,
		),
		count(
			"event_names_mv",
			rawCount,
			`SELECT sum(event_count) FROM event_names_mv WHERE ${where}`,
		),
		count(
			"events_org_dimension_hourly_mv customer_id",
			rawCount,
			`SELECT sumMerge(event_count) FROM events_org_dimension_hourly_mv WHERE ${dim("customer_id")}`,
		),
		count(
			"events_org_dimension_hourly_mv plan_id",
			rawCount,
			`SELECT sumMerge(event_count) FROM events_org_dimension_hourly_mv WHERE ${dim("plan_id")}`,
		),
		count(
			"events_org_dimension_hourly_mv entity_id",
			rawEntity,
			`SELECT sumMerge(event_count) FROM events_org_dimension_hourly_mv WHERE ${dim("entity_id")}`,
		),
		count(
			"events_org_dimension_monthly_mv customer_id",
			rawCount,
			`SELECT sumMerge(event_count) FROM events_org_dimension_monthly_mv WHERE ${dim("customer_id")}`,
		),
		value(
			"events_customer_hourly_mv total_value",
			`SELECT sum(total_value) FROM events_customer_hourly_mv WHERE ${where}`,
		),
		value(
			"events_customer_daily_mv total_value",
			`SELECT sumMerge(total_value) FROM events_customer_daily_mv WHERE ${where}`,
		),
		value(
			"events_org_dimension_hourly_mv total_value",
			`SELECT sumMerge(total_value) FROM events_org_dimension_hourly_mv WHERE ${dim("customer_id")}`,
		),
	]);

	const propertyRollups: [string, Map<string, number>, string][] = [
		["events_property_mv", gated, "sum(event_count)"],
		["events_property_daily_mv", gated, "sumMerge(event_count)"],
		["events_property_monthly_mv", gated, "sumMerge(event_count)"],
		["events_org_property_hourly_mv", gated, "sumMerge(event_count)"],
		["events_org_property_daily_mv", gated, "sumMerge(event_count)"],
		["events_org_property_monthly_mv", gated, "sumMerge(event_count)"],
		[
			"events_org_property_coverage_hourly_mv",
			present,
			"sumMerge(event_count)",
		],
		[
			"events_customer_property_coverage_hourly_mv",
			present,
			"sumMerge(event_count)",
		],
	];
	const allKeys = [...new Set([...gated.keys(), ...present.keys()])].sort();
	for (const [datasource, expected, agg] of propertyRollups) {
		const actual = await keyed({
			target,
			sql: `SELECT property_key k, ${agg} c FROM ${datasource} WHERE ${where} GROUP BY k`,
		});
		for (const key of allKeys) {
			checks.push({
				label: `${datasource} [${key}]`,
				expected: expected.get(key) ?? 0,
				actual: actual.get(key) ?? 0,
				tolerance: 0,
			});
		}
	}
	return { rawCount, rawValue, rawEntity, gated, present, checks };
};

/** Checks every rollup the analytics pipes read against the raw events for one org/env. */
export const verifyRollups = async ({
	target,
	orgId,
	env,
}: {
	target: TinybirdTarget;
	orgId: string;
	env: string;
}) => {
	const collected = await collectChecks({ target, orgId, env });
	const { rawCount, rawValue, gated, present } = collected;
	const pipes = await collectPipeChecks({ target, orgId, env, ...collected });
	const checks = [...collected.checks, ...pipes.checks];
	const [fingerprint] = await querySql<{ f: string }>({
		target,
		sql: `SELECT hex(groupBitXor(cityHash64(id, toString(timestamp), customer_id, event_name, toString(value), coalesce(entity_id, ''), coalesce(internal_product_id, ''), properties::String))) f FROM events WHERE ${orgEnvWhere({ orgId, env })}`,
	});
	console.log(
		`\nverify ${orgId}/${env}: raw count ${rawCount.toLocaleString()}, raw value ${rawValue}, data fingerprint ${fingerprint.f}`,
	);
	console.log(
		`  property keys (present / passes rollup gate): ${[...present.keys()]
			.sort()
			.map((k) => `${k} ${present.get(k)}/${gated.get(k) ?? 0}`)
			.join(", ")}`,
	);
	let failures = 0;
	for (const check of checks) {
		const ok = Math.abs(check.actual - check.expected) <= check.tolerance;
		if (!ok) failures++;
		console.log(
			`  ${ok ? "ok  " : "FAIL"} ${check.label.padEnd(58)} ${check.actual} ${ok ? "==" : "!="} ${check.expected}`,
		);
	}
	for (const note of pipes.notes) console.log(`  info ${note}`);
	console.log(
		failures === 0
			? `verify: ${checks.length}/${checks.length} checks match raw`
			: `verify: ${failures} of ${checks.length} checks FAILED`,
	);
	return failures === 0;
};
