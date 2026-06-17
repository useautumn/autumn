import type Anthropic from "@anthropic-ai/sdk";
import type { AppEnv } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { cmaRepo } from "../repos/claudeManagedRepo.js";

// One CMA memory store per (org, env); content lives in CMA's mounted files.
// Leaf persists only the memstore_… id.
export const ensureMemoryStore = async ({
	client,
	env,
	orgId,
}: {
	client: Anthropic;
	env: AppEnv;
	orgId: string;
}): Promise<string> => {
	const existing = await cmaRepo.getMemoryStoreId({ db, env, orgId });
	if (existing) return existing;

	const memStore = await client.beta.memoryStores.create({
		description:
			"Persistent context for this org across Slack threads: customers, billing actions, preferences, and prior decisions.",
		name: `Autumn ${orgId} ${env}`,
	});
	await cmaRepo.upsertMemory({ db, env, memoryStoreId: memStore.id, orgId });
	return memStore.id;
};
