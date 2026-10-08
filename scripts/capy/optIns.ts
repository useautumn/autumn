import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Stack pieces a Capy machine runs only after an agent opts in; markers survive sleep and reboot. */
const OPT_INS = {
	alien: { envKeys: ["ALIEN_API_KEY"], devServices: [] },
	trigger: { envKeys: [], devServices: ["trigger"] },
	eve: { envKeys: [], devServices: ["eve", "leaf"] },
	checkout: { envKeys: [], devServices: ["checkout"] },
	atom: { envKeys: [], devServices: ["herald", "atom"] },
} as const satisfies Record<
	string,
	{ envKeys: readonly string[]; devServices: readonly string[] }
>;

/** scripts/dev.ts service names every Capy stack runs. */
const DEFAULT_DEV_SERVICES = [
	"server",
	"workers",
	"cron",
	"balance-worker",
	"vite",
	"stripe",
];

export type CapyOptIn = keyof typeof OPT_INS;

const CAPY_OPT_INS = Object.keys(OPT_INS) as CapyOptIn[];

export const CAPY_OPT_IN_DIR = join(
	process.env.CAPY_PREFIX ?? join(homedir(), ".autumn-capy"),
	"opt-ins",
);

export const isOptedIn = ({
	name,
	dir = CAPY_OPT_IN_DIR,
}: {
	name: CapyOptIn;
	dir?: string;
}) => existsSync(join(dir, name));

/** `--<name>` writes the marker and `--no-<name>` removes it; true when that changed anything. */
export function applyOptInFlags({
	args,
	dir = CAPY_OPT_IN_DIR,
}: {
	args: string[];
	dir?: string;
}): boolean {
	let changed = false;
	for (const name of CAPY_OPT_INS) {
		const wanted = args.includes(`--${name}`)
			? true
			: args.includes(`--no-${name}`)
				? false
				: null;
		if (wanted === null || wanted === isOptedIn({ name, dir })) continue;
		if (wanted) {
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, name), "");
		} else {
			rmSync(join(dir, name), { force: true });
		}
		changed = true;
	}
	return changed;
}

/** Env keys kept from the stack because their opt-in is off. */
export function withheldEnvKeys({
	dir = CAPY_OPT_IN_DIR,
}: {
	dir?: string;
} = {}): string[] {
	return CAPY_OPT_INS.filter((name) => !isOptedIn({ name, dir })).flatMap(
		(name) => [...OPT_INS[name].envKeys],
	);
}

/** Browser apps that integration tests never reach. */
const FRONTEND_DEV_SERVICES = ["vite", "checkout", "leaf"];

/** scripts/dev.ts services to launch: the defaults plus every opted-in piece, minus frontends when serverOnly. */
export function capyDevServices({
	dir = CAPY_OPT_IN_DIR,
	serverOnly = false,
}: {
	dir?: string;
	serverOnly?: boolean;
} = {}): string[] {
	const services = [
		...DEFAULT_DEV_SERVICES,
		...CAPY_OPT_INS.filter((name) => isOptedIn({ name, dir })).flatMap(
			(name) => [...OPT_INS[name].devServices],
		),
	];
	if (!serverOnly) return services;
	return services.filter((name) => !FRONTEND_DEV_SERVICES.includes(name));
}
