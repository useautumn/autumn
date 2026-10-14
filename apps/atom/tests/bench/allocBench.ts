/**
 * Bytes allocated and thread time per stage of one deduction and one push, each stage run alone in a loop on a held
 * 40-balance subject. Allocation comes from JSC's own count: the child runs with BUN_JSC_logGC=1 and the driver sums
 * "bytes allocated this cycle" between the stage's markers, plus the heap growth the forced collection after it reports.
 * `bun run bench:alloc [iterations] [backgroundCustomers]`
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	computeCheck,
	computeTrack,
	createSubjectState,
	mergeSubjectStates,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { AppEnv, fullSubjectToRelevantFeatures } from "@autumn/shared";
import { workerStateToApiBalance } from "../../../../packages/balance-engine/src/apiRenderer/balances/workerStateToApiBalance.js";
import { checkCommandToDeductionRequest } from "../../../../packages/balance-engine/src/commands/check/checkCommandToDeductionRequest.js";
import { deduct } from "../../../../packages/balance-engine/src/deduction/deduct.js";
import { selectDeductionRows } from "../../../../packages/balance-engine/src/deduction/setup/selectDeductionRows.js";
import { setupDeductionContext } from "../../../../packages/balance-engine/src/deduction/setup/setupDeductionContext.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
} from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { subjectPushToStoredSubject } from "../../src/lib/contracts/subjectContract.js";
import { getAtomLogger } from "../../src/lib/logging/getAtomLogger.js";
import {
	checkToCommand,
	renderCheck,
} from "../../src/processor/actions/check/answerCheck.js";
import { checkRequestToAnswerableCheck } from "../../src/processor/actions/check/checkForwardRules.js";
import { checkResponseToJson } from "../../src/processor/actions/check/checkResponseToJson.js";
import { readCurrentSubject } from "../../src/processor/actions/readCurrentSubject/readCurrentSubject.js";
import { replayOwed } from "../../src/processor/actions/readCurrentSubject/replayOwed.js";
import { checkToTrackCommand } from "../../src/processor/actions/track/trackToCommand.js";
import { createSlotProcessor } from "../../src/processor/createSlotProcessor.js";
import { createHeldSubjects } from "../../src/state/heldSubjects/createHeldSubjects.js";
import { openJournal } from "../../src/state/journal/openJournal.js";
import { openCatalogStore } from "../../src/state/openCatalogStore.js";
import { openSqliteStore } from "../../src/state/openSqliteStore.js";
import { subjectToSlice } from "../../src/state/repos/subjectStates.js";
import {
	atomOrg,
	checkRequestFor,
	noFolderPulls,
} from "../unit/utils/atomFixtures.js";

const HOT_BALANCES = 40;
const CLOCK_TICK_MS = 10;

const jsThreadCpuMs = (): number => {
	const fields = readFileSync(`/proc/self/task/${process.pid}/stat`, "utf8")
		.split(") ")[1]
		?.split(" ");
	return (Number(fields?.[11]) + Number(fields?.[12])) * CLOCK_TICK_MS;
};

const subjectOf = ({
	customerId,
	balances,
	plan,
}: {
	customerId: string;
	balances: number;
	plan: number;
}) => {
	const state: SubjectState = createSubjectState({
		identity: { ...identity, customerId },
		customerProducts: [createCustomerProduct()],
		customerEntitlements: Array.from({ length: balances }, (_, i) =>
			createCustomerEntitlement({
				id: i === 0 ? "messages_monthly" : `feature_${i}_p${plan}_monthly`,
				featureId: i === 0 ? "messages" : `feature_${i}_p${plan}`,
				balance: 1_000_000_000,
			}),
		),
	});
	return { state, catalog: createCatalogFor({ state }), org: atomOrg };
};

type StageRun = {
	name: string;
	iterations: number;
	cpuMs: number;
	wallMs: number;
};

const child = async ({
	iterations,
	backgroundCustomers,
}: {
	iterations: number;
	backgroundCustomers: number;
}) => {
	const folder = mkdtempSync(join(tmpdir(), "atom-alloc-"));
	const held = createHeldSubjects({ budgetBytes: 512 * 1024 ** 2 });
	const sqliteStore = openSqliteStore({
		databasePath: join(folder, "slot.sqlite"),
		held,
	});
	const journal = openJournal({ databasePath: join(folder, "journal.sqlite") });
	const ctx = {
		sqliteStore,
		catalogStore: openCatalogStore({ databasePath: ":memory:" }),
		logger: getAtomLogger(),
		subjectPulls: noFolderPulls,
		journal,
	};
	const processor = createSlotProcessor({ ctx });
	const customerId = "cus_hot";
	const hot = subjectOf({ customerId, balances: HOT_BALANCES, plan: 0 });
	const pushBody = (readAt: number, atomSeq: number | null) =>
		JSON.stringify({
			...hot,
			state: {
				...hot.state,
				customer: {
					...hot.state.customer,
					...(atomSeq !== null && {
						atom_seqs: { atom_bench: { [journal.writerId]: atomSeq } },
					}),
				},
			},
			log_offset: String(readAt),
			read_at: readAt,
		});
	await processor.setSubject({ customerId, body: pushBody(1000, null) });
	for (let i = 0; i < backgroundCustomers; i++) {
		const id = `cus_bg_${i}`;
		await processor.setSubject({
			customerId: id,
			body: JSON.stringify({
				...subjectOf({ customerId: id, balances: 20, plan: i % 8 }),
				log_offset: "1",
				read_at: 1000,
			}),
		});
	}
	const runs: StageRun[] = [];
	let sink = 0;
	const stage = async (
		name: string,
		fn: (i: number) => unknown | Promise<unknown>,
	) => {
		Bun.gc(true);
		console.error(`__STAGE ${name} begin`);
		const cpuAt = jsThreadCpuMs();
		const wallAt = performance.now();
		for (let i = 0; i < iterations; i++) {
			const out = fn(i);
			if (out instanceof Promise) await out;
		}
		const wallMs = performance.now() - wallAt;
		const cpuMs = jsThreadCpuMs() - cpuAt;
		console.error(`__STAGE ${name} end`);
		Bun.gc(true);
		runs.push({ name, iterations, cpuMs, wallMs });
	};

	const check = checkRequestToAnswerableCheck({
		request: {
			...checkRequestFor({ params: { customer_id: customerId } }),
			requestId: "req_x",
		},
	});
	const deductingCheck = checkRequestToAnswerableCheck({
		request: {
			...checkRequestFor({
				params: {
					customer_id: customerId,
					send_event: true,
					required_balance: 1,
				},
			}),
			requestId: "req_x",
		},
	});
	const subject0 = readCurrentSubject({ ctx, customerId, entityId: null });
	const command0 = checkToCommand({ check: deductingCheck, subject: subject0 });
	const track0 = checkToTrackCommand({
		command: command0,
		subject: subject0,
		skipEvent: false,
		idempotencyKey: null,
	});

	const result0 = computeCheck({
		fullSubject: subject0.fullSubject,
		command: command0,
	});
	// Per deduction: the engine's decision alone.
	await stage("engineDecision", () => {
		sink += computeCheck({
			fullSubject: subject0.fullSubject,
			command: command0,
		}).allowed
			? 1
			: 0;
	});
	// Inside the decision: rows selected, the draw, and the outcome shaped.
	const request0 = checkCommandToDeductionRequest({ command: command0 });
	await stage("decision.selectRows", () => {
		sink += selectDeductionRows({
			fullSubject: subject0.fullSubject,
			selection: request0.selection,
		}).customerEntitlements.length;
	});
	await stage("decision.setupContext", () => {
		sink += setupDeductionContext({
			fullSubject: subject0.fullSubject,
			selection: request0.selection,
		}).rows.length;
	});
	await stage("decision.deduct", () => {
		sink += deduct({
			fullSubject: subject0.fullSubject,
			request: request0,
		}).appliedValue;
	});
	// Inside the fold step: the track decided, and the mutation applied to the state.
	const mutation0 = computeTrack({
		fullSubject: subject0.fullSubject,
		command: track0,
	});
	await stage("foldStep.computeTrack", () => {
		sink += computeTrack({ fullSubject: subject0.fullSubject, command: track0 })
			.changes.length;
	});
	await stage("foldStep.applyMutation", () => {
		sink += applyMutation({ state: hot.state, mutation: mutation0 }).revision;
	});
	// Inside the render: the balance read, the version changes, the JSON.
	const renderContext = {
		org: subject0.org,
		env: AppEnv.Sandbox,
		features: subject0.features,
		logger: ctx.logger,
		expand: [],
	};
	await stage("render.apiBalance", () => {
		sink +=
			workerStateToApiBalance({
				ctx: renderContext,
				fullSubject: subject0.fullSubject,
				featureId: "messages",
				allocationView: "spendable",
			})?.remaining ?? 0;
	});
	await stage("render.relevantFeatures", () => {
		sink += fullSubjectToRelevantFeatures({
			fullSubject: subject0.fullSubject,
			featureId: "messages",
			features: subject0.features,
		}).length;
	});
	const rendered0 = renderCheck({
		ctx,
		check,
		command: command0,
		result: result0,
		subject: subject0,
	});
	await stage("render.toJson", () => {
		sink += checkResponseToJson({ response: rendered0.response }).length;
	});
	// Per deduction: the command objects (check command, track command).
	await stage("commands", (i) => {
		const command = checkToCommand({
			check: { ...deductingCheck, requestId: `req_${i}` },
			subject: subject0,
		});
		sink += checkToTrackCommand({
			command,
			subject: subject0,
			skipEvent: false,
			idempotencyKey: null,
		}).value;
	});
	// Per deduction: one engine fold step alone (computeTrack + applyMutation), no join.
	const entry0 = { seq: 1, customerId, command: track0, appendedAt: 0 };
	await stage("engineFoldStepAlone", () => {
		sink += replayOwed({
			owed: [entry0],
			state: hot.state,
			catalog: subject0.catalog,
			fullSubject: subject0.fullSubject,
		}).customerEntitlements.length;
	});
	// Per deduction: the joined full subject rebuilt from a state (subjectStateToFullSubject + merge).
	await stage("toFullSubject", () => {
		sink += Object.keys(
			subjectStateToFullSubject({
				state: mergeSubjectStates({ customer: hot.state, entity: null }),
				catalog: subject0.catalog,
				entityId: null,
			}),
		).length;
	});
	// Per deduction: the features list the view carries.
	await stage("featuresList", () => {
		sink += Object.values({ ...subject0.catalog.features }).length;
	});
	// Per deduction: the API response rendered and stringified.
	await stage("renderResponse", () => {
		const { response } = renderCheck({
			ctx,
			check,
			command: command0,
			result: result0,
			subject: subject0,
		});
		sink += checkResponseToJson({ response }).length;
	});
	// Per deduction: the journal append, committed.
	let seq = 0;
	await stage("journalAppend", async () => {
		seq++;
		await journal.append({
			customerId,
			command: { ...track0, commandId: `cmd_${seq}` },
		});
	});
	// Per deduction: the view after an append (fold step + join + features), as the deduction reads it.
	await stage("appendThenRead", async () => {
		seq++;
		const committed = journal.append({
			customerId,
			command: { ...track0, commandId: `cmd_${seq}` },
		});
		sink += readCurrentSubject({ ctx, customerId, entityId: null }).features
			.length;
		await committed;
	});
	// Per deduction: the whole processor path, in-process (no HTTP).
	await stage("processorDeduct", async (i) => {
		sink += (
			await processor.check({
				request: {
					...checkRequestFor({
						params: {
							customer_id: customerId,
							send_event: true,
							required_balance: 1,
						},
					}),
					requestId: `atom_req_${i}`,
				},
			})
		).json.length;
	});
	// Per check: the whole processor path for a plain check (view cached).
	await stage("processorCheck", async (i) => {
		sink += (
			await processor.check({
				request: {
					...checkRequestFor({ params: { customer_id: customerId } }),
					requestId: `atom_req_c${i}`,
				},
			})
		).json.length;
	});
	// Per push: a 40-balance subject parsed, stored, held and reconciled; then the view folded across it.
	const lastSeq = () => journal.owed({ customerId }).at(-1)?.seq ?? seq;
	let readAt = 2000;
	await stage("pushApply", async () => {
		readAt++;
		await processor.setSubject({
			customerId,
			body: pushBody(readAt, lastSeq()),
		});
		sink += readCurrentSubject({ ctx, customerId, entityId: null }).features
			.length;
	});
	// Inside the push: its parse and validation, its store (slice stringify + hash, state stringify, SQLite), the journal reconcile, and the view after it.
	const body0 = pushBody(readAt, lastSeq());
	await stage("push.jsonParse", () => {
		sink += Object.keys(JSON.parse(body0)).length;
	});
	await stage("push.toStoredSubject", () => {
		sink += subjectPushToStoredSubject({ customerId, body: body0 }).readAt;
	});
	const stored0 = subjectPushToStoredSubject({ customerId, body: body0 });
	await stage("push.subjectToSlice", () => {
		sink += subjectToSlice({ subject: stored0 }).hash.length;
	});
	await stage("push.stateStringify", () => {
		sink += JSON.stringify(stored0.state).length;
	});
	await stage("push.storeSetSubject", () => {
		readAt++;
		sink += sqliteStore.setSubject({
			subject: { ...stored0, readAt, logOffset: BigInt(readAt) },
		})
			? 1
			: 0;
	});
	await stage("push.reconcile", () => {
		journal.reconcile({
			customerId,
			atomSeqs: { atom_bench: { [journal.writerId]: lastSeq() } },
		});
	});
	await stage("push.viewAfterPush", () => {
		readAt++;
		sqliteStore.setSubject({
			subject: { ...stored0, readAt, logOffset: BigInt(readAt) },
		});
		sink += readCurrentSubject({ ctx, customerId, entityId: null }).features
			.length;
	});
	console.log(
		JSON.stringify({
			runs,
			sink,
			owedAtEnd: journal.owed({ customerId }).length,
		}),
	);
	rmSync(folder, { recursive: true, force: true });
	process.exit(0);
};

/** Bytes allocated in a stage: each collection's heap at its start less the previous collection's heap at its end, summed. */
const parse = ({ log, runs }: { log: string; runs: StageRun[] }) => {
	let lastAfterKb = 0;
	const out: Record<string, unknown>[] = [];
	let current: { name: string; allocatedKb: number; ended: boolean } | null =
		null;
	for (const line of log.split("\n")) {
		const begin = line.match(/^__STAGE (\S+) begin/);
		if (begin)
			current = { name: begin[1] as string, allocatedKb: 0, ended: false };
		if (current && /^__STAGE \S+ end/.test(line)) current.ended = true;
		const start = line.match(/START M (\d+)kb => (\w+)Collection/);
		if (start && current) {
			current.allocatedKb += Math.max(0, Number(start[1]) - lastAfterKb);
			if (current.ended && start[2] === "Full") {
				const run = runs.find((r) => r.name === current?.name);
				if (run)
					out.push({
						stage: current.name,
						bytesPerCall: Math.round(
							(current.allocatedKb * 1024) / run.iterations,
						),
						cpuUsPerCall: Number(
							((run.cpuMs * 1000) / run.iterations).toFixed(1),
						),
						wallUsPerCall: Number(
							((run.wallMs * 1000) / run.iterations).toFixed(1),
						),
					});
				current = null;
			}
		}
		const end = line.match(
			/=> (\d+)kb, p=[\d.]+ms \(max [\d.]+\), cycle [\d.]+ms END/,
		);
		if (end) lastAfterKb = Number(end[1]);
	}
	return out;
};

if (process.argv[2] === "child")
	await child({
		iterations: Number(process.argv[3]),
		backgroundCustomers: Number(process.argv[4]),
	});
else {
	const iterations = Number(process.argv[2] ?? 3000);
	const backgroundCustomers = Number(process.argv[3] ?? 0);
	const folder = mkdtempSync(join(tmpdir(), "atom-alloc-driver-"));
	const logPath = join(folder, "gc.log");
	const proc = Bun.spawn(
		[
			process.execPath,
			"--config=./bunfig.toml",
			import.meta.path,
			"child",
			String(iterations),
			String(backgroundCustomers),
		],
		{
			stdout: "pipe",
			stderr: Bun.file(logPath),
			env: { ...process.env, BUN_JSC_logGC: "1" },
		},
	);
	const stdout = await new Response(proc.stdout).text();
	await proc.exited;
	const { runs, owedAtEnd } = JSON.parse(
		stdout.trim().split("\n").at(-1) as string,
	);
	const rows = parse({ log: await Bun.file(logPath).text(), runs });
	console.log(
		JSON.stringify(
			{ iterations, backgroundCustomers, owedAtEnd, rows },
			null,
			1,
		),
	);
	rmSync(folder, { recursive: true, force: true });
}
