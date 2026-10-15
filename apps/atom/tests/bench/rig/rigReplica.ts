/**
 * Replica box: the real Atom entry point (src/main.ts) as the shadow's release runs it, under a supervisor the driver
 * scripts a rolling deploy through (stop, start on the same data dir, peers, status). The Atom finds its peer as
 * `atom.svc`, from /etc/hosts lines the supervisor rewrites (root, as the boxes run it): the same lookup and 5 s cache as
 * on Alien, with the record's timing in the driver's hands. `bun run rig:replica --self <ip> --peer <ip> --stub <url> --peer-secret <s>`.
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { rigConfig } from "./rigConfig.js";

const { values } = parseArgs({
	options: {
		self: { type: "string" },
		peer: { type: "string" },
		stub: { type: "string" },
		"peer-secret": { type: "string" },
	},
});
const { self, peer, stub } = values;
const peerSecret = values["peer-secret"];
if (!self || !peer || !stub || !peerSecret)
	throw new Error(
		"Usage: rig:replica --self <this box's IP> --peer <the other replica's IP> --stub http://<driver IP>:18877 --peer-secret <hex>",
	);

const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const { replica, tenant } = rigConfig;
/** In queue mode the replicas read pushes from the stub's queue, as the shadow reads its linked `pushes` SQS queue. */
const pushQueueEnv =
	rigConfig.stub.pushVia === "queue"
		? {
				ALIEN_PUSHES_BINDING: JSON.stringify({
					service: "sqs",
					queueUrl: `${stub}/000000000000/pushes`,
				}),
			}
		: {};
// One data dir for the supervisor's lifetime: a restart finds its files, as a new container finds the volume.
const dataDir = mkdtempSync(join(tmpdir(), "atom-rig-"));
const HOSTS_FILE = "/etc/hosts";
const SERVICE_NAME = "atom.svc";
const logDir = join(homedir(), "atom-rig");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `replica-${self}.log`);
const log = openSync(logPath, "a");
const defaultSrcDir = join(import.meta.dir, "../../..");
const healthUrl = `http://${self}:${replica.port}/health`;
const READY_POLL_MS = 100;

type AtomRun = {
	child: ReturnType<typeof Bun.spawn>;
	srcDir: string;
	env: Record<string, string>;
	startedAt: number;
	readyAt: number | null;
	sigtermAt: number | null;
	exitedAt: number | null;
};

let peers: string[] = [peer];
let run: AtomRun | null = null;
let restarts = 0;
/** Chaos: what the supervisor did to the Atom on the driver's say (netem on the peer port, SIGKILL + wipe). */
const chaos = {
	netemAt: null as number | null,
	netemClearedAt: null as number | null,
	netemError: null as string | null,
	killArmedAt: null as number | null,
	killedAt: null as number | null,
	killLine: null as string | null,
	wipedAt: null as number | null,
	wipePending: false,
};
/** Every journal writer id this box's data dir has held, so the driver can tell whose decision each hand-in was. */
const knownWriters = new Set<string>();

const readWriters = (): string[] => {
	const files = (readdirSync(dataDir, { recursive: true }) as string[]).filter(
		(name) => name.endsWith(".sqlite"),
	);
	for (const file of files) {
		try {
			const database = new Database(join(dataDir, file), { readonly: true });
			const row = database
				.query<{ writerId: string }, []>(
					"SELECT writer_id AS writerId FROM journal_meta WHERE id = 1",
				)
				.get();
			database.close();
			if (row?.writerId) knownWriters.add(row.writerId);
		} catch {}
	}
	return [...knownWriters];
};

const sh = (args: string[]) => {
	const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0)
		throw new Error(`${args.join(" ")}: ${result.stderr.toString().trim()}`);
	return result.stdout.toString();
};
const peerIface = () =>
	/ dev (\S+)/.exec(sh(["ip", "-o", "route", "get", peer]))?.[1] ?? "ens5";

/** Delays what this box sends to the peer port (a prio band with netem, picked by a u32 dport filter) until cleared. */
const startNetem = ({
	delayMs,
	durationMs,
	port,
}: {
	delayMs: number;
	durationMs: number;
	port: number;
}) => {
	const dev = peerIface();
	sh(["modprobe", "sch_netem"]);
	sh([
		"tc",
		"qdisc",
		"replace",
		"dev",
		dev,
		"root",
		"handle",
		"1:",
		"prio",
		"bands",
		"4",
		"priomap",
		..."1 2 2 2 1 2 0 0 1 1 1 1 1 1 1 1".split(" "),
	]);
	sh([
		"tc",
		"qdisc",
		"replace",
		"dev",
		dev,
		"parent",
		"1:4",
		"handle",
		"40:",
		"netem",
		"delay",
		`${delayMs}ms`,
	]);
	sh([
		"tc",
		"filter",
		"add",
		"dev",
		dev,
		"protocol",
		"ip",
		"parent",
		"1:0",
		"prio",
		"4",
		"u32",
		"match",
		"ip",
		"dport",
		String(port),
		"0xffff",
		"flowid",
		"1:4",
	]);
	chaos.netemAt = Date.now();
	chaos.netemClearedAt = null;
	setTimeout(clearNetem, durationMs);
	return { dev };
};

const clearNetem = () => {
	if (chaos.netemAt === null || chaos.netemClearedAt !== null) return;
	Bun.spawnSync(["tc", "qdisc", "del", "dev", peerIface(), "root"]);
	chaos.netemClearedAt = Date.now();
};

/** Tails the Atom's log from now; on the first line matching `pattern`, SIGKILLs the Atom and, if asked, wipes its data dir. */
const killOn = ({ pattern, wipe }: { pattern: string; wipe: boolean }) => {
	const target = run;
	if (!target) throw new Error("no Atom running");
	const matcher = new RegExp(pattern);
	const fd = openSync(logPath, "r");
	let offset = fstatSync(fd).size;
	let carry = "";
	chaos.killArmedAt = Date.now();
	const buffer = Buffer.alloc(1 << 20);
	const poll = async () => {
		while (target.exitedAt === null) {
			const n = readSync(fd, buffer, 0, buffer.length, offset);
			if (n > 0) {
				offset += n;
				const lines = (carry + buffer.toString("utf8", 0, n)).split("\n");
				carry = lines.pop() ?? "";
				const hit = lines.find((line) => matcher.test(line));
				if (hit) {
					target.child.kill("SIGKILL");
					chaos.killedAt = Date.now();
					chaos.wipePending = wipe;
					chaos.killLine = hit.slice(0, 2_000);
					await target.child.exited;
					if (wipe) {
						readWriters();
						rmSync(dataDir, { recursive: true, force: true });
						mkdirSync(dataDir, { recursive: true });
						chaos.wipedAt = Date.now();
						chaos.wipePending = false;
					}
					break;
				}
				continue;
			}
			await Bun.sleep(5);
		}
		closeSync(fd);
	};
	void poll();
};

/** atom.svc resolves to this box and `next`, as hickory lists the running containers; written whole and renamed into place. */
const writePeers = (next: string[]): void => {
	peers = next;
	const kept = readFileSync(HOSTS_FILE, "utf8")
		.split("\n")
		.filter((line) => !line.includes(` ${SERVICE_NAME}`));
	const listed = [self, ...next].map((ip) => `${ip} ${SERVICE_NAME}`);
	writeFileSync(`${HOSTS_FILE}.next`, `${[...kept, ...listed].join("\n")}\n`);
	renameSync(`${HOSTS_FILE}.next`, HOSTS_FILE);
};

const watchReady = async (started: AtomRun): Promise<void> => {
	while (started.exitedAt === null) {
		const status = await fetch(healthUrl)
			.then((reply) => reply.status)
			.catch(() => 0);
		if (status === 200) {
			started.readyAt = Date.now();
			return;
		}
		await Bun.sleep(READY_POLL_MS);
	}
};

/** The box keeps each src slot n at /root/s<n>/atom-rig; the same apps/atom inside it. */
const srcDirOf = (src: number) =>
	defaultSrcDir.replace(/\/s\d+\/atom-rig\//, `/s${src}/atom-rig/`);
const shaOf = (srcDir: string) =>
	Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: srcDir })
		.stdout.toString()
		.trim();

/** The Atom's own log lines a swap is judged by: each sender thread's handoff and its announcement. */
const HANDOFF_TYPES = new Set([
	"atom_handoff",
	"atom_leaving",
	"atom_peer_handed",
	"atom_peer_joined",
	"atom_leave_unannounced",
	"atom_grant_unannounced",
	"atom_handover_in_flight",
]);
const handoffLines = () =>
	readFileSync(logPath, "utf8")
		.split("\n")
		.filter((line) => line.includes('"type":"atom_'))
		.flatMap((line) => {
			try {
				const parsed = JSON.parse(line) as {
					time: number;
					type: string;
					data?: unknown;
				};
				return HANDOFF_TYPES.has(parsed.type)
					? [{ time: parsed.time, type: parsed.type, data: parsed.data }]
					: [];
			} catch {
				return [];
			}
		});

const startAtom = ({
	srcDir,
	env = {},
}: {
	srcDir: string;
	env?: Record<string, string>;
}): AtomRun => {
	const child = Bun.spawn(
		[process.execPath, "--config=./bunfig.toml", "src/main.ts"],
		{
			cwd: srcDir,
			stdout: log,
			stderr: log,
			env: {
				PATH: process.env.PATH ?? "",
				HOME: process.env.HOME ?? "",
				NODE_ENV: replica.nodeEnv,
				ATOM_MODE: "multi_tenant",
				ATOM_TOKEN_HASH: sha256(tenant.adminToken),
				ATOM_SLOT_COUNT: String(replica.slotCount),
				ATOM_THREADS: String(replica.threads),
				ATOM_HOSTNAME: self,
				ATOM_PORT: String(replica.port),
				ATOM_PEER_PORT: String(replica.peerPort),
				ATOM_PEER_SECRET: peerSecret,
				ATOM_DATA_DIR: dataDir,
				AUTUMN_API_URL: stub,
				...pushQueueEnv,
				...replica.bunJscFlags,
				...replica.extraEnv,
				...env,
			},
		},
	);
	const started: AtomRun = {
		child,
		srcDir,
		env,
		startedAt: Date.now(),
		readyAt: null,
		sigtermAt: null,
		exitedAt: null,
	};
	void child.exited.then(() => {
		started.exitedAt = Date.now();
	});
	void watchReady(started);
	return started;
};

/** SIGTERM, as horizond stops a container, then the Atom's own drain decides when it exits. */
const stopAtom = async (): Promise<Pick<AtomRun, "sigtermAt" | "exitedAt">> => {
	const stopping = run;
	if (!stopping || stopping.exitedAt !== null)
		return { sigtermAt: null, exitedAt: stopping?.exitedAt ?? null };
	stopping.sigtermAt = Date.now();
	stopping.child.kill("SIGTERM");
	await stopping.child.exited;
	stopping.exitedAt ??= Date.now();
	clearNetem();
	// A SIGKILL + wipe finishes its wipe before the driver may start the Atom again.
	while (chaos.wipePending) await Bun.sleep(10);
	return { sigtermAt: stopping.sigtermAt, exitedAt: stopping.exitedAt };
};

const statusOf = () => ({
	self,
	peers,
	restarts,
	dataDir,
	running: run !== null && run.exitedAt === null,
	pid: run?.child.pid ?? null,
	srcDir: run?.srcDir ?? null,
	env: run?.env ?? null,
	startedAt: run?.startedAt ?? null,
	readyAt: run?.readyAt ?? null,
	sigtermAt: run?.sigtermAt ?? null,
	exitedAt: run?.exitedAt ?? null,
	now: Date.now(),
	chaos,
});

const control = Bun.serve({
	hostname: self,
	port: replica.controlPort,
	fetch: async (request) => {
		const { pathname } = new URL(request.url);
		if (pathname === "/status") return Response.json(statusOf());
		if (pathname === "/writers")
			return Response.json({ writers: readWriters() });
		if (pathname === "/handoffs")
			return Response.json({ lines: handoffLines() });
		if (request.method !== "POST")
			return new Response("control: POST /stop | /start | /peers", {
				status: 405,
			});
		const body = (await request.json().catch(() => ({}))) as {
			peers?: string[];
			srcDir?: string;
			src?: number;
			env?: Record<string, string>;
			delayMs?: number;
			durationMs?: number;
			port?: number;
			pattern?: string;
			wipe?: boolean;
		};
		if (pathname === "/netem") {
			try {
				return Response.json({
					at: Date.now(),
					...startNetem({
						delayMs: body.delayMs ?? 2_000,
						durationMs: body.durationMs ?? 60_000,
						port: body.port ?? replica.peerPort,
					}),
				});
			} catch (error) {
				chaos.netemError = String(error);
				return Response.json({ error: String(error) }, { status: 500 });
			}
		}
		if (pathname === "/killOn") {
			killOn({
				pattern: body.pattern ?? "atom_handoff",
				wipe: body.wipe ?? false,
			});
			return Response.json({ armedAt: chaos.killArmedAt });
		}
		if (pathname === "/stop") return Response.json(await stopAtom());
		if (pathname === "/kill") {
			const target = run;
			if (!target || target.exitedAt !== null)
				return Response.json({ error: "not running" }, { status: 409 });
			target.child.kill("SIGKILL");
			const killedAt = Date.now();
			await target.child.exited;
			target.exitedAt ??= Date.now();
			return Response.json({ killedAt, exitedAt: target.exitedAt });
		}
		if (pathname === "/peers") {
			writePeers(body.peers ?? []);
			return Response.json({ at: Date.now(), peers });
		}
		if (pathname === "/start") {
			if (run && run.exitedAt === null)
				return Response.json({ error: "already running" }, { status: 409 });
			const srcDir =
				body.srcDir ??
				(body.src === undefined ? defaultSrcDir : srcDirOf(body.src));
			if (!existsSync(srcDir))
				return Response.json(
					{ error: `no src dir ${srcDir}` },
					{ status: 400 },
				);
			if (body.peers) writePeers(body.peers);
			if (run) restarts++;
			run = startAtom({ srcDir, env: body.env });
			return Response.json({
				startedAt: run.startedAt,
				pid: run.child.pid,
				srcDir,
				sha: shaOf(srcDir),
				env: run.env,
			});
		}
		return new Response("no such control route", { status: 404 });
	},
});

writePeers([peer]);
run = startAtom({ srcDir: defaultSrcDir });
console.log(JSON.stringify({ initialSha: shaOf(defaultSrcDir) }));
console.log(
	JSON.stringify({
		variant: rigConfig.variant,
		bun: Bun.version,
		revision: Bun.revision,
		self,
		peer,
		stub,
		threads: replica.threads,
		pushVia: rigConfig.stub.pushVia,
		dataDir,
		control: `http://${self}:${replica.controlPort}`,
		log: logPath,
	}),
);

for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => {
		void stopAtom().then(() => {
			control.stop(true);
			process.exit(0);
		});
	});
