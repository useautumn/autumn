import type { ProviderName } from "./helpers/provider.ts";
import type { TestCapabilityId } from "./helpers/testCapabilities.ts";

export type TwEnv = "sandbox";

export type TwRunArgs = {
	groupsOrPatterns: string[];
	workers: number;
	perWorker: number;
	ref: string;
	keep: boolean;
	allowDirty: boolean;
	dashboard: boolean;
	provider: ProviderName;
	balanceWorker: boolean;
	fanoutBench: boolean;
};

export type OwnerTag = {
	owner: string;
	runId: string;
};

export type RunStatus = "running" | "completed" | "cancelled";

export type RegistryWebhook = {
	sandboxName: string;
	accountId: string;
	webhookId: string;
};

export type RegistrySandbox = {
	name: string;
	id?: string;
};

export type RegistryEntry = {
	runId: string;
	owner: string;
	startedAt: number;
	status: RunStatus;
	ref: string;
	provider?: ProviderName;
	sandboxes: RegistrySandbox[];
	subAccounts: string[];
	svixAppId?: string;
	svixAppIds?: string[];
	webhooks: RegistryWebhook[];
};

export type Registry = Record<string, RegistryEntry>;

export type WorkerHandle = {
	name: string;
	sandboxId?: string;
	publicUrl: string;
	accountId?: string;
	capabilities: TestCapabilityId[];
	lastFile?: string;
	inFlight: number;
};
