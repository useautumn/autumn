import { orgEnvWhere } from "../lib/sqlString.js";
import { callPipe, querySql } from "../lib/tinybirdHttp.js";
import type { TinybirdTarget } from "../lib/tinybirdTarget.js";

export type PipeCheck = {
	label: string;
	expected: number;
	actual: number;
	tolerance: number;
};

type PipeRow = {
	period: string;
	event_name: string;
	total_value: number;
	event_count?: number;
};

const sum = (rows: PipeRow[], field: "total_value" | "event_count") =>
	rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);

export const collectPipeChecks = async ({
	target,
	orgId,
	env,
	rawCount,
	rawValue,
	rawEntity,
	present,
	gated,
}: {
	target: TinybirdTarget;
	orgId: string;
	env: string;
	rawCount: number;
	rawValue: number;
	rawEntity: number;
	present: Map<string, number>;
	gated: Map<string, number>;
}): Promise<{ checks: PipeCheck[]; notes: string[] }> => {
	const where = orgEnvWhere({ orgId, env });
	const [window] = await querySql<{ start: string; end: string }>({
		target,
		sql: `SELECT formatDateTime(toStartOfHour(min(timestamp)), '%F %T') start, formatDateTime(toStartOfHour(max(timestamp)) + INTERVAL 1 HOUR, '%F %T') end FROM events WHERE ${where}`,
	});
	const names = await querySql<{ event_name: string }>({
		target,
		sql: `SELECT DISTINCT event_name FROM event_names_mv WHERE ${where}`,
	});
	const base = {
		org_id: orgId,
		env,
		event_names: names.map((row) => row.event_name).join(","),
		start_date: window.start,
		end_date: window.end,
		bin_size: "month",
		timezone: "UTC",
	};
	const valueTolerance = Math.max(1e-6, Math.abs(rawValue) * 1e-9);
	const groupable = (params: Record<string, string>) =>
		callPipe<PipeRow>({
			target,
			pipe: "aggregate_groupable",
			params: { ...base, max_groups: "5", ...params },
		});

	const checks: PipeCheck[] = [];
	const simple = await callPipe<PipeRow>({
		target,
		pipe: "aggregate_simple",
		params: base,
	});
	checks.push({
		label: "aggregate_simple total_value",
		expected: rawValue,
		actual: sum(simple, "total_value"),
		tolerance: valueTolerance,
	});

	const kolkata = await callPipe<PipeRow>({
		target,
		pipe: "aggregate_simple",
		params: { ...base, bin_size: "day", timezone: "Asia/Kolkata" },
	});
	checks.push({
		label: "aggregate_simple day Asia/Kolkata total_value",
		expected: rawValue,
		actual: sum(kolkata, "total_value"),
		tolerance: valueTolerance,
	});
	const notes = [
		await compareKolkataDayBins({ target, where, window, kolkata }),
	];

	const byCustomer = await groupable({
		group_column: "customer_id",
		use_org_dimension_rollup: "1",
	});
	checks.push({
		label: "aggregate_groupable customer_id event_count",
		expected: rawCount,
		actual: sum(byCustomer, "event_count"),
		tolerance: 0,
	});

	if (rawEntity > 0) {
		const byEntity = await groupable({
			group_column: "entity_id",
			use_org_dimension_rollup: "1",
		});
		checks.push({
			label: "aggregate_groupable entity_id event_count",
			expected: rawEntity,
			actual: sum(byEntity, "event_count"),
			tolerance: 0,
		});
	}

	for (const [key, count] of [...present.entries()].sort()) {
		const rollup = (gated.get(key) ?? 0) === count;
		const rows = await groupable({
			group_column: "property",
			property_key: key,
			...(rollup
				? { use_org_property_rollup: "1" }
				: { skip_property_rollup: "1" }),
		});
		checks.push({
			label: `aggregate_groupable property ${key} (${rollup ? "org rollup" : "raw"}) event_count`,
			expected: count,
			actual: sum(rows, "event_count"),
			tolerance: 0,
		});
	}
	return { checks, notes };
};

const compareKolkataDayBins = async ({
	target,
	where,
	window,
	kolkata,
}: {
	target: TinybirdTarget;
	where: string;
	window: { start: string; end: string };
	kolkata: PipeRow[];
}) => {
	const raw = await querySql<{ period: string; event_name: string; v: number }>(
		{
			target,
			sql: `SELECT formatDateTime(toStartOfDay(timestamp, 'Asia/Kolkata'), '%F %T') period, event_name, sum(toFloat64(coalesce(value, 1))) v FROM events WHERE ${where} AND timestamp >= toDateTime('${window.start}') AND timestamp < toDateTime('${window.end}') GROUP BY period, event_name`,
		},
	);
	const rawBins = new Map(
		raw.map((row) => [`${row.period}|${row.event_name}`, Number(row.v)]),
	);
	const keys = new Set([
		...rawBins.keys(),
		...kolkata.map((row) => `${row.period}|${row.event_name}`),
	]);
	const pipeBins = new Map(
		kolkata.map((row) => [
			`${row.period}|${row.event_name}`,
			Number(row.total_value),
		]),
	);
	const matching = [...keys].filter(
		(key) =>
			Math.abs((pipeBins.get(key) ?? 0) - (rawBins.get(key) ?? 0)) < 1e-6,
	).length;
	return `aggregate_simple day Asia/Kolkata bins matching raw toStartOfDay(timestamp, 'Asia/Kolkata'): ${matching}/${keys.size} (info only)`;
};
