import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Infra a Capy stack runs only once an agent opts in; the marker survives sleep and reboot. */
const OPT_IN_ENV_KEYS = {
	alien: ["ALIEN_API_KEY"],
} as const;

type CapyOptIn = keyof typeof OPT_IN_ENV_KEYS;

const CAPY_OPT_INS = Object.keys(OPT_IN_ENV_KEYS) as CapyOptIn[];

export const CAPY_OPT_IN_DIR = join(
	homedir(),
	".capy/work/autumn-capy/opt-ins",
);

const isOptedIn = ({ name, dir }: { name: CapyOptIn; dir: string }) =>
	existsSync(join(dir, name));

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
		(name) => [...OPT_IN_ENV_KEYS[name]],
	);
}
