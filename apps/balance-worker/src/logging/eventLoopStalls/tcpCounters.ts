import { readCounterFile } from "./cpuCounters.js";

const PROC_FILES = {
	Tcp: "/proc/net/snmp",
	TcpExt: "/proc/net/netstat",
} as const;

type ProcTable = keyof typeof PROC_FILES;

/** Loss signals summed over every flow in the namespace; `outSegs` is the denominator. */
const TCP_COUNTERS = {
	timeouts: ["TcpExt", "TCPTimeouts"],
	retransSegs: ["Tcp", "RetransSegs"],
	lossProbes: ["TcpExt", "TCPLossProbes"],
	lostRetransmit: ["TcpExt", "TCPLostRetransmit"],
	synRetrans: ["TcpExt", "TCPSynRetrans"],
	outSegs: ["Tcp", "OutSegs"],
} as const satisfies Record<string, readonly [ProcTable, string]>;

type TcpCounterName = keyof typeof TCP_COUNTERS;

/** Cumulative since boot, for this process's network namespace. */
export type TcpCounters = Record<TcpCounterName, number>;

/** `/proc/net/snmp` and `/proc/net/netstat` give each table a row of names, then a row of values. */
function procTableOf({
	text,
	table,
}: {
	text: string | null;
	table: ProcTable;
}): Map<string, number> {
	const [names, values] = (text?.split("\n") ?? [])
		.filter((line) => line.startsWith(`${table}: `))
		.map((line) =>
			line
				.slice(table.length + 2)
				.trim()
				.split(/\s+/),
		);
	if (!names || !values) return new Map();
	return new Map(names.map((name, index) => [name, Number(values[index])]));
}

/** Null where `/proc/net` is absent (macOS, dev) or a counter is missing. */
export function readTcpCounters({
	readFile = readCounterFile,
}: {
	readFile?: (params: { path: string }) => string | null;
} = {}): TcpCounters | null {
	const tables = {
		Tcp: procTableOf({
			text: readFile({ path: PROC_FILES.Tcp }),
			table: "Tcp",
		}),
		TcpExt: procTableOf({
			text: readFile({ path: PROC_FILES.TcpExt }),
			table: "TcpExt",
		}),
	};
	const counters: Partial<TcpCounters> = {};
	for (const name of Object.keys(TCP_COUNTERS) as TcpCounterName[]) {
		const [table, field] = TCP_COUNTERS[name];
		const value = tables[table].get(field);
		if (value === undefined || !Number.isFinite(value)) return null;
		counters[name] = value;
	}
	return counters as TcpCounters;
}

export function tcpWindowOf({
	previous,
	current,
}: {
	previous: TcpCounters;
	current: TcpCounters;
}): TcpCounters {
	const window: Partial<TcpCounters> = {};
	for (const name of Object.keys(TCP_COUNTERS) as TcpCounterName[])
		window[name] = current[name] - previous[name];
	return window as TcpCounters;
}
