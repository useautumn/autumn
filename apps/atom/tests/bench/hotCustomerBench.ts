/**
 * One customer deducting at a fixed rate on one owner thread, its journal forwarded to a worker-faithful Autumn in another
 * process that pushes the subject back after the push lag. `bun run bench:hot [rate] [seconds] [pushLagMs]`.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createState,
} from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createAutumnClient } from "../../src/autumnClient/createAutumnClient.js";
import { createJournalForwarder } from "../../src/journalForwarder/createJournalForwarder.js";
import { getAtomLogger } from "../../src/lib/logging/getAtomLogger.js";
import { readViewFoldThreadStats } from "../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import { createSlotProcessor } from "../../src/processor/createSlotProcessor.js";
import { createHeldSubjects } from "../../src/state/heldSubjects/createHeldSubjects.js";
import { openJournal } from "../../src/state/journal/openJournal.js";
import { openCatalogStore } from "../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../src/state/openSqliteStore.js";
import {
	atomOrg,
	checkRequestFor,
	noFolderPulls,
} from "../unit/utils/atomFixtures.js";
import { WORKER_AUTUMN_PATH } from "./workerAutumn.js";

const rate = Number(process.argv[2] ?? 100);
const seconds = Number(process.argv[3] ?? 20);
const pushLagMs = Number(process.argv[4] ?? 1_500);
/** A resend-like customer: one balance per feature it is billed on. */
const BALANCES = 40;
const AUTUMN_PORT = 18_778;
const PUSH_PORT = 18_779;
/** Checks before this are not measured: the push loop needs one lag to reach its steady state. */
const WARMUP_MS = pushLagMs + 2_000;
/** Linux reports a thread's CPU in clock ticks of this many ms. */
const CLOCK_TICK_MS = 10;

/** CPU this process's JS thread has used, in ms: the owner thread's own work, not the runtime's helper threads. */
const jsThreadCpuMs = (): number => {
	const fields = readFileSync(`/proc/self/task/${process.pid}/stat`, "utf8")
		.split(") ")[1]
		?.split(" ");
	return (Number(fields?.[11]) + Number(fields?.[12])) * CLOCK_TICK_MS;
};

const folder = mkdtempSync(join(tmpdir(), "atom-hot-"));
const state = createState({
	customerEntitlements: Array.from({ length: BALANCES }, (_, i) =>
		createCustomerEntitlement({
			id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
			featureId: i === 0 ? "messages" : `feature_${i}`,
			balance: 100_000_000,
		}),
	),
});
const subject = { state, catalog: createCatalogFor({ state }), org: atomOrg };
const subjectPath = join(folder, "subject.json");
await Bun.write(subjectPath, JSON.stringify(subject));

const autumn = Bun.spawn(
	[
		process.execPath,
		WORKER_AUTUMN_PATH,
		String(AUTUMN_PORT),
		`http://127.0.0.1:${PUSH_PORT}/`,
		String(pushLagMs),
		subjectPath,
	],
	{ stdout: "ignore", stderr: "inherit" },
);
await Bun.sleep(500);

const sqliteStore = openSqliteStore({
	databasePath: join(folder, "slot.sqlite"),
	held: createHeldSubjects({ budgetBytes: 512 * 1024 ** 2 }),
});
const journal = openJournal({ databasePath: join(folder, "journal.sqlite") });
/** The append's own synchronous work, up to its commit: what an owed array copy would cost. */
let appendUs = 0;
let measuring = false;
const append = journal.append;
journal.append = (params) => {
	const startedAt = performance.now();
	const appended = append(params);
	if (measuring) appendUs += (performance.now() - startedAt) * 1000;
	return appended;
};
const processor = createSlotProcessor({
	ctx: {
		sqliteStore,
		catalogStore: openCatalogStore({ databasePath: ":memory:" }),
		logger: getAtomLogger(),
		subjectPulls: noFolderPulls,
		journal,
		openLocks: createOpenLocks(),
	},
});
const client = createAutumnClient({
	autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
});
const forwarding = createJournalForwarder({
	ctx: { autumnClient: client, logger: { info() {}, warn() {} } },
}).forward({ journal, tokenHash: () => "hash_bench", pulls: noFolderPulls });

let pushes = 0;
const pushServer = Bun.serve({
	hostname: "127.0.0.1",
	port: PUSH_PORT,
	fetch: async (request) => {
		pushes++;
		await processor.setSubject({
			customerId: request.headers.get(ATOM_CUSTOMER_ID_HEADER) ?? "",
			body: await request.text(),
		});
		return new Response(null, { status: 204 });
	},
});
await processor.setSubject({
	customerId: "cus_1",
	body: JSON.stringify({
		...subject,
		log_offset: "1",
		read_at: 1000,
	}),
});

const latenciesMs: number[] = [];
const pending: Promise<unknown>[] = [];
const total = rate * seconds;
const startedAt = performance.now();
let cpuBefore: number | null = null;
let measuredFrom = 0;
let measuredCalls = 0;
for (let sent = 0; sent < total; ) {
	const now = performance.now();
	if (cpuBefore === null && now - startedAt >= WARMUP_MS) {
		cpuBefore = jsThreadCpuMs();
		measuredFrom = sent;
		measuring = true;
	}
	const due = Math.min(total, Math.floor(((now - startedAt) / 1000) * rate));
	for (; sent < due; sent++) {
		// The driver sends call `sent` once (sent + 1) / rate seconds have passed.
		const intendedAt = startedAt + ((sent + 1) / rate) * 1000;
		const measured = cpuBefore !== null;
		pending.push(
			processor
				.check({
					request: {
						...checkRequestFor({
							params: {
								customer_id: "cus_1",
								send_event: true,
								required_balance: 1,
							},
						}),
						requestId: `atom_req_${sent}`,
					},
				})
				.then(() => {
					if (measured) latenciesMs.push(performance.now() - intendedAt);
				}),
		);
	}
	await Bun.sleep(1);
}
await Promise.all(pending);
measuredCalls = total - measuredFrom;
const cpuMs = jsThreadCpuMs() - (cpuBefore ?? 0);
latenciesMs.sort((a, b) => a - b);
const percentile = (share: number) =>
	Number(
		(
			latenciesMs[
				Math.min(latenciesMs.length - 1, Math.floor(latenciesMs.length * share))
			] ?? 0
		).toFixed(2),
	);
console.log(
	JSON.stringify({
		rate,
		seconds,
		pushLagMs,
		measuredCalls,
		threadCpuMsPerDeduction: Number((cpuMs / measuredCalls).toFixed(3)),
		p50Ms: percentile(0.5),
		p99Ms: percentile(0.99),
		maxMs: percentile(1),
		pushes,
		appendUsPerDeduction: Number((appendUs / measuredCalls).toFixed(2)),
		...readViewFoldThreadStats(),
		owedAtEnd: journal.owed({ customerId: "cus_1" }).length,
	}),
);
forwarding.stop();
pushServer.stop(true);
autumn.kill();
rmSync(folder, { recursive: true, force: true });
process.exit(0);
