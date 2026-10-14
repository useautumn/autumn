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
import type { ProviderName } from "./provider.ts";

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

export const save = async (registry: Registry): Promise<void> => {
	await mkdir(REGISTRY_DIR, { recursive: true });
	const tmpPath = join(dirname(REGISTRY_FILE), `.registry.${randomUUID()}.tmp`);
	await writeFile(tmpPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
	await rename(tmpPath, REGISTRY_FILE);
};

let writeQueue: Promise<unknown> = Promise.resolve();

const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
	const run = writeQueue.then(task, task);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
};

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

export const createRun = ({
	owner,
	runId,
	ref,
	provider,
}: {
	owner: string;
	runId: string;
	ref: string;
	provider: ProviderName;
}): Promise<RegistryEntry> =>
	enqueueWrite(async () => {
		const registry = await load();
		const entry: RegistryEntry = {
			runId,
			owner,
			startedAt: Date.now(),
			status: "running",
			ref,
			provider,
			sandboxes: [],
			subAccounts: [],
			webhooks: [],
		};
		registry[runId] = entry;
		await save(registry);
		return entry;
	});

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

export const addSubAccount = async (
	runId: string,
	accountId: string,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		if (!entry.subAccounts.includes(accountId)) {
			entry.subAccounts.push(accountId);
		}
	});

export const addSubAccounts = async (
	runId: string,
	accountIds: string[],
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		const known = new Set(entry.subAccounts);
		for (const accountId of accountIds) {
			if (!known.has(accountId)) {
				known.add(accountId);
				entry.subAccounts.push(accountId);
			}
		}
	});

export const addWebhook = async (
	runId: string,
	webhook: RegistryWebhook,
): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		if (!entry.webhooks.some((w) => w.webhookId === webhook.webhookId)) {
			entry.webhooks.push(webhook);
		}
	});

export const getSvixAppIds = (
	entry: Pick<RegistryEntry, "svixAppId" | "svixAppIds">,
): string[] => [
	...new Set([
		...(entry.svixAppIds ?? []),
		...(entry.svixAppId ? [entry.svixAppId] : []),
	]),
];

export const addSvixApp = async ({
	runId,
	svixAppId,
}: {
	runId: string;
	svixAppId: string;
}): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		entry.svixAppIds = [...new Set([...getSvixAppIds(entry), svixAppId])];
	});

const COMPLETED_RUNS_RETAINED = 20;

const pruneCompletedRuns = (registry: Registry): void => {
	const completed = Object.values(registry)
		.filter((entry) => entry.status === "completed")
		.sort((a, b) => b.startedAt - a.startedAt);
	for (const entry of completed.slice(COMPLETED_RUNS_RETAINED)) {
		delete registry[entry.runId];
	}
};

export const markCompleted = async (runId: string): Promise<RegistryEntry> =>
	enqueueWrite(async () => {
		const registry = await load();
		const entry = registry[runId];
		if (!entry) {
			throw new Error(`tw registry: no entry for runId ${runId}`);
		}
		entry.status = "completed";
		pruneCompletedRuns(registry);
		await save(registry);
		return entry;
	});

export const markCancelled = async (runId: string): Promise<RegistryEntry> =>
	updateEntry(runId, (entry) => {
		entry.status = "cancelled";
	});

export const removeRun = (runId: string): Promise<void> =>
	enqueueWrite(async () => {
		const registry = await load();
		if (!(runId in registry)) {
			return;
		}
		delete registry[runId];
		await save(registry);
	});

export const listRuns = async (owner: string): Promise<RegistryEntry[]> => {
	const registry = await load();
	return Object.values(registry)
		.filter((entry) => entry.owner === owner)
		.sort((a, b) => b.startedAt - a.startedAt);
};

export const getRun = async (
	runId: string,
): Promise<RegistryEntry | undefined> => {
	const registry = await load();
	return registry[runId];
};
