/**
 * Replica box: the real Atom entry point (src/main.ts) as the shadow's release runs it, under a supervisor the driver
 * scripts a rolling deploy through (stop, start on the same data dir, peers, status). The Atom finds its peer as
 * `atom.svc`, from /etc/hosts lines the supervisor rewrites (root, as the boxes run it): the same lookup and 5 s cache as
 * on Alien, with the record's timing in the driver's hands. `bun run rig:replica --self <ip> --peer <ip> --stub <url> --peer-secret <s>`.
 */
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { rigConfig } from "./rigConfig.js";
import { preloadJournalKeys } from "./rigPreloadKeys.js";

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
	startedAt: number;
	readyAt: number | null;
	sigtermAt: number | null;
	exitedAt: number | null;
};

let peers: string[] = [peer];
let run: AtomRun | null = null;
let restarts = 0;

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

const startAtom = ({ srcDir }: { srcDir: string }): AtomRun => {
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
			},
		},
	);
	const started: AtomRun = {
		child,
		srcDir,
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
	startedAt: run?.startedAt ?? null,
	readyAt: run?.readyAt ?? null,
	sigtermAt: run?.sigtermAt ?? null,
	exitedAt: run?.exitedAt ?? null,
});

const control = Bun.serve({
	hostname: self,
	port: replica.controlPort,
	fetch: async (request) => {
		const { pathname } = new URL(request.url);
		if (pathname === "/status") return Response.json(statusOf());
		if (request.method !== "POST")
			return new Response("control: POST /stop | /start | /peers", {
				status: 405,
			});
		const body = (await request.json().catch(() => ({}))) as {
			peers?: string[];
			srcDir?: string;
		};
		if (pathname === "/stop") return Response.json(await stopAtom());
		if (pathname === "/peers") {
			writePeers(body.peers ?? []);
			return Response.json({ at: Date.now(), peers });
		}
		if (pathname === "/start") {
			if (run && run.exitedAt === null)
				return Response.json({ error: "already running" }, { status: 409 });
			if (body.peers) writePeers(body.peers);
			if (run) restarts++;
			run = startAtom({ srcDir: body.srcDir ?? defaultSrcDir });
			return Response.json({ startedAt: run.startedAt, pid: run.child.pid });
		}
		return new Response("no such control route", { status: 404 });
	},
});

writePeers([peer]);
const preloaded = replica.preloadKeys
	? preloadJournalKeys({
			folder: join(dataDir, rigConfig.tenant.atomId),
			slotCount: replica.slotCount,
			...replica.preloadKeys,
		})
	: null;
run = startAtom({ srcDir: defaultSrcDir });
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
		preloaded,
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
