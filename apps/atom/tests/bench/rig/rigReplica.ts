/**
 * Replica box: the real Atom entry point (src/main.ts) as the shadow's release runs it, on this box's address, its
 * peer found through `atom.svc` in /etc/hosts. `bun run rig:replica --self <ip> --peer <ip> --stub <url> --peer-secret <s>`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, readFileSync } from "node:fs";
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

const hosts = readFileSync("/etc/hosts", "utf8");
const listed = (ip: string) =>
	new RegExp(
		`^\\s*${ip.replaceAll(".", "\\.")}\\s+.*\\batom\\.svc\\b`,
		"m",
	).test(hosts);
if (!listed(self) || !listed(peer))
	throw new Error(
		`The replicas find each other as atom.svc: run\n  printf '${self} atom.svc\\n${peer} atom.svc\\n' | sudo tee -a /etc/hosts`,
	);

const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const { replica, tenant } = rigConfig;
const dataDir = mkdtempSync(join(tmpdir(), "atom-rig-"));
const logDir = join(homedir(), "atom-rig");
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `replica-${self}.log`);
const log = openSync(logPath, "a");

console.log(
	JSON.stringify({
		variant: rigConfig.variant,
		bun: Bun.version,
		revision: Bun.revision,
		self,
		peer,
		stub,
		threads: replica.threads,
		dataDir,
		log: logPath,
	}),
);
const atom = Bun.spawn(
	[process.execPath, "--config=./bunfig.toml", "src/main.ts"],
	{
		cwd: join(import.meta.dir, "../../.."),
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
			...replica.bunJscFlags,
			...replica.extraEnv,
		},
	},
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => atom.kill(signal));
process.exit(await atom.exited);
