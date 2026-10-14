import chalk from "chalk";
import { getOwner } from "../helpers/owner.ts";
import {
	deleteSandbox,
	listSandboxesByOwner,
	setProvider,
} from "../helpers/provider.ts";
import * as registry from "../helpers/registry.ts";
import {
	deleteConnectWebhook,
	deleteSubAccount,
	sweepOrphans,
} from "../helpers/stripe.ts";
import {
	keyIndexFromWebhookTag,
	stripeKeyByIndex,
} from "../helpers/stripeKeyPool.ts";
import { sweepOrphanSvixApps } from "../helpers/svix.ts";
import type { RegistryEntry } from "../types.ts";
import { deleteSvixApp } from "./run.ts";

const TEARDOWN_PER_RESOURCE_TIMEOUT_MS = 20_000;
const ORPHAN_CUTOFF_MS = 60 * 60 * 1000;
const ORPHAN_SANDBOX_AGE_MS = ORPHAN_CUTOFF_MS;

const log = (message: string): void => {
	console.log(chalk.cyan(`[tw] ${message}`));
};

const warn = (message: string): void => {
	console.warn(chalk.yellow(`[tw] ${message}`));
};

const timeBoxed = async (
	label: string,
	action: () => Promise<void>,
	timeoutMs: number = TEARDOWN_PER_RESOURCE_TIMEOUT_MS,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			warn(`${label} timed out after ${timeoutMs}ms — moving on`);
			resolve();
		}, timeoutMs);
	});
	try {
		await Promise.race([action(), timeout]);
	} catch (error) {
		warn(`${label} failed: ${(error as Error).message}`);
	} finally {
		if (timer) {
			clearTimeout(timer);
		}
	}
};

const teardownEntry = async (entry: RegistryEntry): Promise<void> => {
	log(
		`killing run ${entry.runId} (${entry.subAccounts.length} sub-account(s), ${entry.sandboxes.length} sandbox(es)${
			registry.getSvixAppIds(entry).length
				? `, ${registry.getSvixAppIds(entry).length} svix app(s)`
				: ""
		})`,
	);

	await setProvider(entry.provider ?? "vercel");

	for (const accountId of entry.subAccounts) {
		await timeBoxed(`delete sub-account ${accountId}`, () =>
			deleteSubAccount(accountId),
		);
	}

	for (const webhook of entry.webhooks) {
		const webhookKey = stripeKeyByIndex(
			keyIndexFromWebhookTag(webhook.accountId),
		);
		await timeBoxed(`delete connect webhook ${webhook.webhookId}`, () =>
			deleteConnectWebhook(webhook.webhookId, webhookKey),
		);
	}

	for (const appId of registry.getSvixAppIds(entry)) {
		await timeBoxed(`delete svix app ${appId}`, () => deleteSvixApp(appId));
	}

	for (const sandbox of entry.sandboxes) {
		await timeBoxed(`delete sandbox ${sandbox.name}`, () =>
			deleteSandbox(sandbox.id ?? sandbox.name),
		);
	}

	await registry.removeRun(entry.runId);
	log(`run ${entry.runId} killed and removed from the registry`);
};

export const kill = async (runId: string): Promise<void> => {
	const entry = await registry.getRun(runId);
	if (!entry) {
		warn(`no run ${runId} in the registry (already cleaned up?)`);
		return;
	}

	const owner = getOwner();
	if (entry.owner !== owner) {
		throw new Error(
			`run ${runId} is owned by "${entry.owner}", not "${owner}" — refusing (use kill-all --all-users to override scope)`,
		);
	}

	await teardownEntry(entry);
};

export const killAll = async ({
	allUsers = false,
}: {
	allUsers?: boolean;
} = {}): Promise<void> => {
	const owner = getOwner();
	const all = await registry.load();
	const entries = Object.values(all).filter(
		(entry) =>
			entry.status !== "completed" && (allUsers || entry.owner === owner),
	);

	if (entries.length === 0) {
		log(
			allUsers
				? "no non-completed runs in the registry"
				: `no non-completed runs for owner "${owner}"`,
		);
		return;
	}

	log(
		`killing ${entries.length} run(s)${allUsers ? " (ALL users)" : ` for "${owner}"`}`,
	);
	for (const entry of entries) {
		await teardownEntry(entry);
	}
};

export const killOrphans = async ({
	olderThanMs = ORPHAN_CUTOFF_MS,
}: {
	olderThanMs?: number;
} = {}): Promise<void> => {
	const owner = getOwner();
	log(`sweeping orphans for "${owner}" older than ${olderThanMs}ms`);

	const deletedAccounts = await sweepOrphans({ owner, olderThanMs }).catch(
		(error) => {
			warn(`stripe sweep failed: ${(error as Error).message}`);
			return [] as string[];
		},
	);
	log(`stripe: deleted ${deletedAccounts.length} orphan sub-account(s)`);

	await setProvider("vercel");
	let listed: Awaited<ReturnType<typeof listSandboxesByOwner>> = [];
	try {
		listed = await listSandboxesByOwner(owner);
	} catch (error) {
		warn(`sandbox list failed: ${(error as Error).message}`);
	}

	const cutoff = Date.now() - ORPHAN_SANDBOX_AGE_MS;
	let deletedSandboxes = 0;
	for (const sandbox of listed) {
		if (sandbox.createdAt > cutoff) {
			continue;
		}
		await timeBoxed(`delete orphan sandbox ${sandbox.name}`, async () => {
			await deleteSandbox(sandbox.name);
			deletedSandboxes++;
		});
	}
	log(`vercel: deleted ${deletedSandboxes} orphan sandbox(es)`);

	const deletedSvixApps = await sweepOrphanSvixApps({ olderThanMs }).catch(
		(error) => {
			warn(`svix sweep failed: ${(error as Error).message}`);
			return 0;
		},
	);
	log(`svix: deleted ${deletedSvixApps} orphan app(s)`);

	const all = await registry.load();
	for (const entry of Object.values(all)) {
		if (entry.owner === owner && entry.status !== "completed") {
			await registry.markCancelled(entry.runId).catch(() => {});
		}
	}
};
