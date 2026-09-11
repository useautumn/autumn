import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	type ClaimStarted,
	type ClaimVerified,
	type ProvisionedOrg,
	provisionKeylessOrg,
	slugFor,
	startClaim,
	verifyClaim,
} from "../../auth/keyless";
import { writeEnvValues } from "../../env/loadEnv";
import { type Target, targetBaseUrl } from "../../env/resolveTarget";
import { ask, done, type Prompter } from "../../prompt/prompt";

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
	verifyClaim: (params: {
		email: string;
		otp: string;
	}) => Promise<ClaimVerified>;
};

export const keylessDepsFor = ({ target }: { target: Target }): KeylessDeps => {
	const baseUrl = targetBaseUrl({ target });
	return {
		provision: ({ name, slug }) => provisionKeylessOrg({ baseUrl, name, slug }),
		startClaim: ({ secretKey, email }) =>
			startClaim({ baseUrl, secretKey, email }),
		verifyClaim: ({ email, otp }) => verifyClaim({ baseUrl, email, otp }),
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
	// A URL is for a person to click; an agent has the command above.
	if (prompter.interactive)
		prompter.write(`  Or open ${provisioned.claimUrl} in a browser.\n`);
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

/** Link the keyless org the key belongs to with an account: a code by email, then verify. */
export const runClaim = async ({
	secretKey,
	email,
	otp,
	deps,
	prompter,
}: {
	secretKey: string;
	email: string;
	/** Given headless on the second run; asked for interactively. */
	otp?: string;
	deps: KeylessDeps;
	prompter: Prompter;
}): Promise<ClaimVerified> => {
	let code = otp;
	if (code === undefined) {
		const started = await deps.startClaim({ secretKey, email });
		prompter.write(
			`${done(`Sent a one-time code to ${email} (expires in ${minutesUntil(started.expiresAt)})`)}\n`,
		);
		code = await ask({
			prompter,
			value: undefined,
			question: "Enter the code:",
			flag: `--otp <code>`,
			example: `atmn login --claim ${email} --otp 123456`,
		});
	}
	const verified = await deps.verifyClaim({ email, otp: code });
	prompter.write(
		`${done(`Linked ${verified.organizationSlug} to ${verified.email}. Same key, same plans; the dashboard is at app.useautumn.com`)}\n`,
	);
	return verified;
};
