import { loopbackHost, positiveInteger } from "./balanceWorker/primitives.js";

const LOCAL_ATOM_PORT = 8790;
const AUTUMN_API_URL = "https://api.useautumn.com";
const SHA256_HEX = /^[0-9a-f]{64}$/;

type AtomModeEnv =
	/** In an org's cloud: the hash of the one token this deployment answers to. */
	| { ATOM_DEV: false; ATOM_TOKEN_HASH: string }
	/** On a dev stack: Atoms are added and removed over HTTP, so it must stay on loopback. */
	| { ATOM_DEV: true; ATOM_TOKEN_HASH: null };

const modeEnvOf = ({
	runtimeEnv,
	hostname,
}: {
	runtimeEnv: Record<string, string | undefined>;
	hostname: string;
}): AtomModeEnv => {
	const tokenHash = runtimeEnv.ATOM_TOKEN_HASH?.trim() || null;
	const isDev = runtimeEnv.ATOM_DEV === "true";
	if (isDev && tokenHash)
		throw new Error("Set ATOM_DEV or ATOM_TOKEN_HASH, not both");
	if (isDev) {
		if (!loopbackHost.safeParse(hostname).success)
			throw new Error("ATOM_DEV only runs on a loopback ATOM_HOSTNAME");
		return { ATOM_DEV: true, ATOM_TOKEN_HASH: null };
	}
	if (!tokenHash) throw new Error("Set ATOM_TOKEN_HASH, or ATOM_DEV=true");
	if (!SHA256_HEX.test(tokenHash))
		throw new Error("ATOM_TOKEN_HASH must be a SHA-256 hex digest");
	return { ATOM_DEV: false, ATOM_TOKEN_HASH: tokenHash };
};

/** What Atom reads: where it listens, its data directory, the Autumn API it forwards to, and which tokens it answers to. */
export function createAtomEnv(runtimeEnv: Record<string, string | undefined>) {
	const hostname = runtimeEnv.ATOM_HOSTNAME?.trim() || "127.0.0.1";
	return {
		ATOM_HOSTNAME: hostname,
		ATOM_PORT: positiveInteger.parse(runtimeEnv.ATOM_PORT ?? LOCAL_ATOM_PORT),
		ATOM_DATA_DIR: runtimeEnv.ATOM_DATA_DIR?.trim() || ".data/atom",
		/** Where a request Atom does not answer itself is sent. */
		ATOM_AUTUMN_API_URL: runtimeEnv.AUTUMN_API_URL?.trim() || AUTUMN_API_URL,
		...modeEnvOf({ runtimeEnv, hostname }),
	};
}

export type AtomEnv = ReturnType<typeof createAtomEnv>;
let atomEnv: AtomEnv | undefined;

export function getAtomEnv(): AtomEnv {
	atomEnv ??= createAtomEnv(process.env);
	return atomEnv;
}
