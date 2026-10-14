import chalk from "chalk";
import { Freestyle } from "freestyle";
import {
	DATABASE_CRITICAL_URL,
	DATABASE_URL,
	REDIS_URL,
	SERVER_PORT,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	WARM_SANDBOX_PREFIX,
} from "../constants.ts";
import type { GitSource, ProviderName } from "../helpers/provider.ts";
import {
	createWarmSandbox,
	deleteSandbox,
	getSandboxByName,
	runStreaming,
	setProvider,
	snapshotAndStop,
} from "../helpers/provider.ts";

const WARMUP_SCRIPT = "scripts/tw/image/warmup.sh";
const DEFAULT_REF = "dev";
const SNAPSHOT_READY_TIMEOUT_MS = 12 * 60 * 1000;
const FULL_SHA = /^[0-9a-f]{40}$/;

const log = (line: string): void => {
	console.log(chalk.cyan(`[refresh-warm] ${line}`));
};

const stageTimings: { label: string; ms: number }[] = [];
const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
	const startedAt = Date.now();
	log(`▸ ${label}`);
	try {
		return await fn();
	} finally {
		const ms = Date.now() - startedAt;
		stageTimings.push({ label, ms });
		log(`✓ ${label} (+${(ms / 1000).toFixed(1)}s)`);
	}
};

const printTimingSummary = (totalStartedAt: number): void => {
	log("timing summary:");
	for (const { label, ms } of stageTimings) {
		log(`  ${(ms / 1000).toFixed(1).padStart(7)}s  ${label}`);
	}
	log(
		`  ${((Date.now() - totalStartedAt) / 1000).toFixed(1).padStart(7)}s  TOTAL`,
	);
};

const git = (...args: string[]): string =>
	new TextDecoder()
		.decode(
			Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" })
				.stdout,
		)
		.trim();

const resolveSha = (ref: string): string => {
	if (FULL_SHA.test(ref)) {
		return ref;
	}
	const bareRef = ref.replace(/^origin\//, "");
	const remote = git("ls-remote", "origin", bareRef).split(/\s+/)[0] ?? "";
	if (FULL_SHA.test(remote)) {
		return remote;
	}
	const local = git("rev-parse", ref);
	if (FULL_SHA.test(local)) {
		return local;
	}
	throw new Error(`refresh-warm: cannot resolve ref "${ref}" to a commit sha`);
};

const resolveGitSource = (revision: string): GitSource => {
	let url =
		process.env.TW_GIT_URL || git("config", "--get", "remote.origin.url");
	if (url.startsWith("git@github.com:")) {
		url = `https://github.com/${url.slice("git@github.com:".length)}`;
	}
	url = `${url.replace(/\.git$/, "")}.git`;
	const token = process.env.TW_GIT_TOKEN;
	return token
		? { url, revision, username: "x-access-token", password: token }
		: { url, revision };
};

const requireSecret = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`refresh-warm: missing required secret ${name} in env`);
	}
	return value;
};

const buildWarmEnv = (): Record<string, string> => ({
	NODE_ENV: "development",
	DATABASE_URL,
	DATABASE_CRITICAL_URL,
	REDIS_URL,
	MISC_CACHE_DRAGONFLY_PUBLIC_URL: REDIS_URL,
	CACHE_V2_DRAGONFLY_URL: REDIS_URL,
	SQS_QUEUE_URL_V2,
	TRACK_SQS_QUEUE_URL,
	AUTUMN_DB_DIRECT: "1",
	TW_WORKER_MODE: "1",
	TW_SKIP_STRIPE_ACCOUNT: "1",
	ENCRYPTION_IV: requireSecret("ENCRYPTION_IV"),
	ENCRYPTION_PASSWORD: requireSecret("ENCRYPTION_PASSWORD"),
	BETTER_AUTH_SECRET: requireSecret("BETTER_AUTH_SECRET"),
	AUTUMN_API_URL: `http://localhost:${SERVER_PORT}`,
	AUTUMN_PUBLIC_API_URL: `http://localhost:${SERVER_PORT}`,
});

const freestyleClient = (): Freestyle =>
	new Freestyle({ apiKey: requireSecret("FREESTYLE_API_KEY") });

const findReadySnapshot = async (
	name: string,
): Promise<{ snapshotId: string } | undefined> => {
	const { snapshots } = await freestyleClient().vms.snapshots.list();
	const match = snapshots
		.filter(
			(snap) => snap.name === name && !snap.deleted && snap.state === "ready",
		)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
	return match ? { snapshotId: match.snapshotId } : undefined;
};

const waitForReadySnapshot = async (
	name: string,
): Promise<{ snapshotId: string }> => {
	const deadline = Date.now() + SNAPSHOT_READY_TIMEOUT_MS;
	for (;;) {
		const ready = await findReadySnapshot(name);
		if (ready) {
			return ready;
		}
		if (Date.now() > deadline) {
			throw new Error(
				`refresh-warm: snapshot ${name} never reached READY within ${SNAPSHOT_READY_TIMEOUT_MS / 60_000}min`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 5_000));
	}
};

const refreshModalWarm = async ({
	provider,
	sha,
	warmName,
	totalStartedAt,
}: {
	provider: ProviderName;
	sha: string;
	warmName: string;
	totalStartedAt: number;
}): Promise<number> => {
	process.env.TW_MODAL_NO_STALE = "1";
	await setProvider(provider);

	const existing = await timed("check for an exact published warm image", () =>
		getSandboxByName(warmName),
	);
	if (existing) {
		log(chalk.green(`already fresh — ${warmName} is published; nothing to do`));
		printTimingSummary(totalStartedAt);
		return 0;
	}

	const warm = await timed("create warm sandbox (fast-forward or cold)", () =>
		createWarmSandbox({
			name: warmName,
			tags: { kind: "bun-tw-warm", sha: sha.slice(0, 12) },
			env: buildWarmEnv(),
			source: resolveGitSource(sha),
		}),
	);
	try {
		const warmup = await timed(
			"warmup.sh (checkout → install → migrate → seed)",
			() =>
				runStreaming(warm, ["bash", WARMUP_SCRIPT, sha], (text) =>
					process.stdout.write(text),
				),
		);
		if (warmup.exitCode !== 0) {
			throw new Error(`refresh-warm: warmup.sh exited ${warmup.exitCode}`);
		}
		await timed("snapshot + publish warm image", () => snapshotAndStop(warm));
	} catch (error) {
		log(chalk.red(`build failed — deleting sandbox ${warmName}`));
		await deleteSandbox(warm).catch(() => {});
		throw error;
	}

	const published = await timed("verify the published warm image", () =>
		getSandboxByName(warmName),
	);
	if (!published) {
		throw new Error(
			`refresh-warm: ${warmName} not resolvable after publish — check the run log`,
		);
	}
	log(chalk.green(`warm image ${warmName} published`));
	printTimingSummary(totalStartedAt);
	return 0;
};

export const refreshWarm = async (args: string[]): Promise<number> => {
	const totalStartedAt = Date.now();
	const ref =
		args.find((arg) => arg.startsWith("--ref="))?.slice("--ref=".length) ||
		DEFAULT_REF;
	const provider = (args
		.find((arg) => arg.startsWith("--provider="))
		?.slice("--provider=".length) ?? "modalv2") as ProviderName;

	const sha = await timed(`resolve ref ${ref}`, () =>
		Promise.resolve(resolveSha(ref)),
	);
	const warmName = `${WARM_SANDBOX_PREFIX}-${sha.slice(0, 12)}`;
	log(`target snapshot ${warmName} (ref=${ref} @ ${sha.slice(0, 7)})`);

	if (provider === "modal" || provider === "modalv2") {
		return refreshModalWarm({ provider, sha, warmName, totalStartedAt });
	}
	if (provider !== "freestyle") {
		throw new Error(
			`refresh-warm: unsupported provider "${provider}" (use modalv2, modal, or freestyle)`,
		);
	}

	const existing = await timed("check for an exact READY snapshot", () =>
		findReadySnapshot(warmName),
	);
	if (existing) {
		log(
			chalk.green(
				`already fresh — ${warmName} is READY (${existing.snapshotId}); nothing to do`,
			),
		);
		printTimingSummary(totalStartedAt);
		return 0;
	}

	await setProvider("freestyle");

	const warm = await timed("create warm VM (fast-forward or cold build)", () =>
		createWarmSandbox({
			name: warmName,
			tags: { kind: "bun-tw-warm", sha: sha.slice(0, 12) },
			env: buildWarmEnv(),
			source: resolveGitSource(sha),
		}),
	);

	try {
		const warmup = await timed(
			"warmup.sh (checkout → install → migrate → seed)",
			() =>
				runStreaming(warm, ["bash", WARMUP_SCRIPT, sha], (text) =>
					process.stdout.write(text),
				),
		);
		if (warmup.exitCode !== 0) {
			throw new Error(`refresh-warm: warmup.sh exited ${warmup.exitCode}`);
		}

		await timed("snapshot warm parent (services + server running)", () =>
			snapshotAndStop(warm),
		);
	} catch (error) {
		log(chalk.red(`build failed — deleting VM ${warmName}`));
		await deleteSandbox(warm).catch(() => {});
		throw error;
	}

	const ready = await timed("verify snapshot READY via API", () =>
		waitForReadySnapshot(warmName),
	);
	log(chalk.green(`snapshot ${warmName} READY (${ready.snapshotId})`));
	printTimingSummary(totalStartedAt);
	return 0;
};
