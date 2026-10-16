/**
 * One owner thread deciding checks at a fixed rate on resend-like subjects (many balances), its journal forwarded to an
 * Autumn in another process. `bun run bench:deduct deduct|read [rate] [seconds]`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createState,
} from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createAutumnClient } from "../../src/autumnClient/createAutumnClient.js";
import { createJournalForwarder } from "../../src/journalForwarder/createJournalForwarder.js";
import { getAtomLogger } from "../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../src/processor/createSlotProcessor.js";
import { createHeldSubjects } from "../../src/state/heldSubjects/createHeldSubjects.js";
import { openJournal } from "../../src/state/journal/openJournal.js";
import { createLaggingEntities } from "../../src/state/laggingEntities/createLaggingEntities.js";
import { openCatalogStore } from "../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../src/state/openSqliteStore.js";
import {
	atomOrg,
	checkRequestFor,
	noFolderPulls,
} from "../unit/utils/atomFixtures.js";

const mode = (process.argv[2] ?? "deduct") as "deduct" | "read";
const rate = Number(process.argv[3] ?? 2_000);
const seconds = Number(process.argv[4] ?? 30);
const CUSTOMERS = 5_000;
/** A resend-like customer: one balance per feature it is billed on. */
const BALANCES = 40;
const AUTUMN_PORT = 18_777;

const autumn = Bun.spawn([
	"bun",
	"-e",
	`Bun.serve({ port: ${AUTUMN_PORT}, fetch: async (r) => { await r.arrayBuffer(); return new Response(null, { status: 204 }); } })`,
]);
await Bun.sleep(300);

const folder = mkdtempSync(join(tmpdir(), "atom-bench-"));
const sqliteStore = openSqliteStore({
	databasePath: join(folder, "slot.sqlite"),
	// Every customer held, as a replica's budget holds its working set.
	held: createHeldSubjects({ budgetBytes: 2 * 1024 ** 3 }),
});
const journal = openJournal({ databasePath: join(folder, "journal.sqlite") });
const ctx = {
	sqliteStore,
	catalogStore: openCatalogStore({ databasePath: ":memory:" }),
	logger: getAtomLogger(),
	subjectPulls: noFolderPulls,
	journal,
	openLocks: createOpenLocks(),
	laggingEntities: createLaggingEntities(),
};
const processor = createSlotProcessor({ ctx });
let appendCalls = 0;
const client = createAutumnClient({
	autumnApiUrl: `http://127.0.0.1:${AUTUMN_PORT}`,
});
const forwarding = createJournalForwarder({
	ctx: {
		autumnClient: {
			appendTracks: (params) => {
				appendCalls++;
				return client.appendTracks(params);
			},
		},
		logger: { info() {}, warn() {} },
	},
}).forward({ journal, tokenHash: () => "hash_bench", pulls: noFolderPulls });

const state = createState({
	customerEntitlements: Array.from({ length: BALANCES }, (_, i) =>
		createCustomerEntitlement({
			id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
			featureId: i === 0 ? "messages" : `feature_${i}`,
			balance: 1_000_000,
		}),
	),
});
const catalog = createCatalogFor({ state });
const customerIds = Array.from({ length: CUSTOMERS }, (_, i) => `cus_${i}`);
for (const customerId of customerIds)
	await processor.setSubject({
		customerId,
		body: JSON.stringify({
			state: { ...state, identity: { ...state.identity, customerId } },
			catalog,
			org: atomOrg,
			log_offset: "1",
			read_at: 1000,
		}),
	});

// Every customer's view joined once, as a live replica holds them: what is measured is the steady state.
for (const customerId of customerIds)
	await processor.check({
		request: checkRequestFor({ params: { customer_id: customerId } }),
	});

let sent = 0;
let lagMaxMs = 0;
let lagTotalMs = 0;
let lagTicks = 0;
let due = performance.now() + 10;
const lagTimer = setInterval(() => {
	const lag = Math.max(0, performance.now() - due);
	due = performance.now() + 10;
	lagMaxMs = Math.max(lagMaxMs, lag);
	lagTotalMs += lag;
	lagTicks++;
}, 10);

const cpuBefore = process.cpuUsage();
const startedAt = performance.now();
const pending: Promise<unknown>[] = [];
const total = rate * seconds;
while (sent < total) {
	const shouldHaveSent = Math.min(
		total,
		Math.floor(((performance.now() - startedAt) / 1000) * rate),
	);
	for (; sent < shouldHaveSent; sent++) {
		const customerId = customerIds[sent % CUSTOMERS] as string;
		const request = {
			...checkRequestFor({
				params: {
					customer_id: customerId,
					...(mode === "deduct" && { send_event: true, required_balance: 1 }),
				},
			}),
			requestId: `atom_req_${sent}`,
		};
		pending.push(processor.check({ request }));
	}
	await Bun.sleep(1);
}
await Promise.all(pending);
const cpu = process.cpuUsage(cpuBefore);
const wallMs = performance.now() - startedAt;
clearInterval(lagTimer);
const cpuMs = (cpu.user + cpu.system) / 1000;
console.log(
	JSON.stringify({
		mode,
		rate,
		seconds,
		calls: sent,
		cpuMsPerCall: Number((cpuMs / sent).toFixed(4)),
		coresUsed: Number((cpuMs / wallMs).toFixed(3)),
		loopLagAvgMs: Number((lagTotalMs / lagTicks).toFixed(2)),
		loopLagMaxMs: Math.round(lagMaxMs),
		tracksAppendCalls: appendCalls,
		tracksPerAppend:
			appendCalls === 0 ? null : Number((sent / appendCalls).toFixed(2)),
	}),
);
// No close: the profile's last seconds stay the measured window, not the files' teardown.
forwarding.stop();
autumn.kill();
rmSync(folder, { recursive: true, force: true });
process.exit(0);
