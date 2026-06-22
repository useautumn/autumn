/**
 * Run registry — the authoritative cleanup record for `bun tw` (plan §9a).
 *
 * Mirrors dw's `~/.autumn-worktrees.json` JSON-registry style (see
 * `scripts/dw/helpers/registry.ts`) but persists to `~/.autumn-tw/registry.json`
 * with one entry per `runId`. Resources are written through *incrementally* as
 * they are created, so a crash (even `kill -9`) leaves a usable record for
 * `bun tw list` / `kill` to recover from.
 *
 * Robustness contract: reads never throw — a missing or corrupt file resets to
 * an empty registry. Writes are atomic-ish (temp file + rename) so a torn write
 * can't corrupt the registry.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { REGISTRY_DIR, REGISTRY_FILE } from "../constants.ts";
import type {
	Registry,
	RegistryEntry,
	RegistrySandbox,
	RegistryWebhook,
} from "../types.ts";

/**
 * Load the on-disk registry. Never throws: a missing or unreadable/corrupt file
 * yields a fresh empty registry (plan §9a — tolerate `kill -9` / torn files).
 */
export const load = async (): Promise<Registry> => {
	let raw: string;
	try {
		raw = await readFile(REGISTRY_FILE, "utf-8");
	} catch {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Registry;
		}
		return {};
	} catch {
		return {};
	}
};

/**
 * Persist the registry. Ensures `REGISTRY_DIR` exists, then writes to a temp
 * file and renames over the target so readers never observe a torn write.
 */
export const save = async (registry: Registry): Promise<void> => {
	await mkdir(REGISTRY_DIR, { recursive: true });
	const tmpPath = join(dirname(REGISTRY_FILE), `.registry.${randomUUID()}.tmp`);
	await writeFile(tmpPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
	await rename(tmpPath, REGISTRY_FILE);
};

/**
 * In-process write queue (mutex). The registry is a single shared JSON file and
 * the default run path mutates the SAME `runId` entry from N workers
 * concurrently (`Promise.all` in run.ts). A bare load→mutate→save would race:
 * worker B's `load()` could read a snapshot taken before worker A's `save()`
 * landed, clobbering A's record and orphaning its resources (plan §9a — "nothing
 * is ever orphaned"). To prevent that, every mutating operation chains onto a
 * single shared promise so each load→mutate→save runs atomically as a unit;
 * concurrent mutations queue instead of interleaving.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
	// Swallow the predecessor's rejection so one failed write doesn't poison the
	// chain, but run `task` strictly after it has settled.
	const run = writeQueue.then(task, task);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
};

/**
 * Read-modify-write one entry, serialized through {@link enqueueWrite} so
 * concurrent mutations of the same (or any) entry can't clobber each other. The
 * mutator receives the current entry (throws if absent) and may mutate it in
 * place; the whole registry is then persisted.
 */
const updateEntry = (
	runId: string,
	mutate: (entry: RegistryEntry) => void,
): Promise<RegistryEntry> =>
	enqueueWrite(async () => {
		const registry = await load();
		const entry = registry[runId];
		if (!entry) {
			throw new Error(`tw registry: no entry for runId ${runId}`);
		}
		mutate(entry);
		await save(registry);
		return entry;
	});

/**
 * Create and persist a new `running` run entry. Written before any resource is
 * provisioned so the run is recoverable from its first side effect (plan §9a).
 */
export const createRun = ({
	owner,
	runId,
	ref,
}: {
	owner: string;
	runId: string;
	ref: string;
}): Promise<RegistryEntry> =>
	enqueueWrite(async () => {
		const registry = await load();
		const entry: RegistryEntry = {
			runId,
			owner,
			startedAt: Date.now(),
			status: "running",
			ref,
			sandboxes: [],
			subAccounts: [],
			webhooks: [],
		};
		registry[runId] = entry;
		await save(registry);
		return entry;
	});

/**
 * Record a sandbox for a run (name is the cleanup key; id once known). If a
 * sandbox with the same `name` already exists its `id` is filled in/updated
 * rather than duplicated, so a later "id now known" write upgrades the record.
 */
export const addSandbox = async (
	runId: string,
	sandbox: RegistrySandbox,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		const existing = entry.sandboxes.find((s) => s.name === sandbox.name);
		if (existing) {
			if (sandbox.id !== undefined) {
				existing.id = sandbox.id;
			}
			return;
		}
		entry.sandboxes.push(sandbox);
	});

/** Record a Stripe Connect sub-account id (`acct_*`) for a run (idempotent). */
export const addSubAccount = async (
	runId: string,
	accountId: string,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		if (!entry.subAccounts.includes(accountId)) {
			entry.subAccounts.push(accountId);
		}
	});

/** Record a Stripe webhook endpoint for a run (idempotent on `webhookId`). */
export const addWebhook = async (
	runId: string,
	webhook: RegistryWebhook,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		if (!entry.webhooks.some((w) => w.webhookId === webhook.webhookId)) {
			entry.webhooks.push(webhook);
		}
	});

/** Record the run's single dedicated Svix shard app id (plan §7). */
export const setSvixApp = async (
	runId: string,
	svixAppId: string,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		entry.svixAppId = svixAppId;
	});

/** Mark a run cleanly torn down (plan §9a — clears the orphan signal). */
export const markCompleted = async (runId: string): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		entry.status = "completed";
	});

/** Mark a run cancelled (e.g. Ctrl+C before teardown finished). */
export const markCancelled = async (runId: string): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		entry.status = "cancelled";
	});

/** Drop a run entry entirely (after `kill` finishes its teardown). No-op if absent. */
export const removeRun = (runId: string): Promise<void> =>
	enqueueWrite(async () => {
		const registry = await load();
		if (!(runId in registry)) {
			return;
		}
		delete registry[runId];
		await save(registry);
	});

/** All runs owned by `owner`, newest first (plan §9a `list` is owner-scoped). */
export const listRuns = async (owner: string): Promise<RegistryEntry[]> => {
	const registry = await load();
	return Object.values(registry)
		.filter((entry) => entry.owner === owner)
		.sort((a, b) => b.startedAt - a.startedAt);
};

/** Fetch a single run entry, or undefined if not present. */
export const getRun = async (
	runId: string,
): Promise<RegistryEntry | undefined> => {
	const registry = await load();
	return registry[runId];
};
