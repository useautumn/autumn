import { describe, expect, test } from "bun:test";
import {
	readTcpCounters,
	tcpWindowOf,
} from "../../../src/logging/eventLoopStalls/tcpCounters.js";

const PROC_NET_SNMP = `Ip: Forwarding DefaultTTL InReceives InHdrErrors
Ip: 1 64 254120 0
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 384 164 20 192 10 12606 9388 5 0 251 0
Udp: InDatagrams NoPorts InErrors OutDatagrams
Udp: 3290 12 0 3301
`;

const PROC_NET_NETSTAT = `TcpExt: SyncookiesSent DelayedACKs TCPLostRetransmit TCPTimeouts TCPLossProbes TCPLossProbeRecovery TCPSynRetrans TCPOrigDataSent
TcpExt: 0 137 2 9 15 1 3 6960
IpExt: InNoRoutes InTruncatedPkts InMcastPkts
IpExt: 0 0 4
MPTcpExt: MPCapableSYNRX MPCapableSYNTX
MPTcpExt: 0 0
`;

function readerOf({ files }: { files: Record<string, string> }) {
	return ({ path }: { path: string }) => files[path] ?? null;
}

describe("tcp counters", () => {
	test("each counter comes from its own table, matched by column name", () => {
		const counters = readTcpCounters({
			readFile: readerOf({
				files: {
					"/proc/net/snmp": PROC_NET_SNMP,
					"/proc/net/netstat": PROC_NET_NETSTAT,
				},
			}),
		});
		expect(counters).toEqual({
			timeouts: 9,
			retransSegs: 5,
			lossProbes: 15,
			lostRetransmit: 2,
			synRetrans: 3,
			outSegs: 9_388,
		});
	});

	test("missing /proc/net, or a missing column, reads as nothing", () => {
		expect(readTcpCounters({ readFile: () => null })).toBeNull();
		expect(
			readTcpCounters({
				readFile: readerOf({
					files: {
						"/proc/net/snmp": PROC_NET_SNMP,
						"/proc/net/netstat": PROC_NET_NETSTAT.replace(
							"TCPTimeouts",
							"TCPRenamed",
						),
					},
				}),
			}),
		).toBeNull();
	});

	test("a window is the difference between two reads", () => {
		const previous = {
			timeouts: 9,
			retransSegs: 5,
			lossProbes: 15,
			lostRetransmit: 2,
			synRetrans: 3,
			outSegs: 9_388,
		};
		expect(
			tcpWindowOf({
				previous,
				current: { ...previous, timeouts: 13, retransSegs: 9, outSegs: 19_388 },
			}),
		).toEqual({
			timeouts: 4,
			retransSegs: 4,
			lossProbes: 0,
			lostRetransmit: 0,
			synRetrans: 0,
			outSegs: 10_000,
		});
	});
});
