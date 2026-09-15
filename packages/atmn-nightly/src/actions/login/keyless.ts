import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	type ClaimStarted,
	type ProvisionedOrg,
	provisionKeylessOrg,
	slugFor,
	startClaim,
} from "../../auth/keyless";
import { writeEnvValues } from "../../env/loadEnv";
import { type Target, targetBaseUrl } from "../../env/resolveTarget";
import { done, type Prompter } from "../../prompt/prompt";

/** The one place the two ways in are described; help text and hints both read it. */
export const CONNECT_OPTIONS = {
	login: "sign in on the web (opens a browser; prints the URL if it can't)",
	keyless:
		"create a sandbox org now, no account needed; link it to an account later with `atmn login --claim <email>`",
} as const;

export const CONNECT_QUESTION = "How do you want to connect to Autumn?";

export type KeylessDeps = {
	provision: (params: {
		name: string;
		slug: string;
	}) => Promise<ProvisionedOrg>;
	startClaim: (params: {
		secretKey: string;
		email: string;
	}) => Promise<ClaimStarted>;
};

export const keylessDepsFor = ({ target }: { target: Target }): KeylessDeps => {
	const baseUrl = targetBaseUrl({ target });
	return {
		provision: ({ name, slug }) => provisionKeylessOrg({ baseUrl, name, slug }),
		startClaim: ({ secretKey, email }) =>
			startClaim({ baseUrl, secretKey, email }),
	};
};

/** The org is named after the project: the root package's name, else the folder. */
export const projectNameFor = ({ repoRoot }: { repoRoot: string }): string => {
	const manifest = join(repoRoot, "package.json");
	if (existsSync(manifest)) {
		try {
			const name = (
				JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown }
			).name;
			if (typeof name === "string" && name.trim() !== "") return name.trim();
		} catch {
			// Fall through to the folder name.
		}
	}
	return basename(repoRoot) || "autumn";
};

const daysUntil = (iso: string): string => {
	const ms = new Date(iso).getTime() - Date.now();
	if (Number.isNaN(ms)) return iso;
	const days = Math.max(1, Math.round(ms / 86_400_000));
	return `${days} day${days === 1 ? "" : "s"}`;
};

export type KeylessLoginResult = {
	envPath: string;
	orgId: string;
	orgSlug: string;
	claimExpiresAt: string;
};

/** A sandbox org with no owner, its key in .env; the account comes later. */
export const runKeylessLogin = async ({
	repoRoot,
	envDirs,
	name = projectNameFor({ repoRoot }),
	deps,
	prompter,
}: {
	repoRoot: string;
	envDirs: string[];
	/** The org's name; the slug derives from it. */
	name?: string;
	deps: KeylessDeps;
	prompter: Prompter;
}): Promise<KeylessLoginResult> => {
	const provisioned = await deps.provision({ name, slug: slugFor(name) });
	const envPath = writeEnvValues({
		dirs: envDirs,
		values: { AUTUMN_SECRET_KEY: provisioned.apiKey },
	});
	process.env.AUTUMN_SECRET_KEY = provisioned.apiKey;
	prompter.write(
		`${done(`Created sandbox org ${provisioned.organizationSlug} (keyless). Wrote AUTUMN_SECRET_KEY to ${envPath}`)}\n`,
	);
	prompter.write(
		`  This org has no owner yet. Link it within ${daysUntil(provisioned.claimExpiresAt)}: atmn login --claim you@example.com\n`,
	);
	return {
		envPath,
		orgId: provisioned.organizationId,
		orgSlug: provisioned.organizationSlug,
		claimExpiresAt: provisioned.claimExpiresAt,
	};
};

const minutesUntil = (iso: string): string => {
	const ms = new Date(iso).getTime() - Date.now();
	if (Number.isNaN(ms)) return iso;
	return `${Math.max(1, Math.round(ms / 60_000))} min`;
};

/** Create a browser link that attaches this keyless org to the requested account. */
export const runClaim = async ({
	secretKey,
	email,
	deps,
	prompter,
}: {
	secretKey: string;
	email: string;
	deps: KeylessDeps;
	prompter: Prompter;
}): Promise<ClaimStarted> => {
	const started = await deps.startClaim({ secretKey, email });
	prompter.write(
		`${done(`Created a claim link for ${email} (expires in ${minutesUntil(started.expiresAt)})`)}\n`,
	);
	prompter.write(`  ${started.claimUrl}\n`);
	prompter.write(
		`  The same link was emailed to ${email}. Sign in there to claim the org; the existing key stays valid.\n`,
	);
	return started;
};
