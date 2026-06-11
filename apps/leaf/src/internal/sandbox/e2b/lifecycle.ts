import { Sandbox } from "e2b";
import type { SandboxSessionContext } from "../types.js";
import {
	threadSandboxLookupMetadata,
	threadSandboxMetadata,
} from "./metadata.js";

export type E2bSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

const connect = ({
	apiKey,
	sandboxId,
	timeoutMs,
}: {
	apiKey: string;
	sandboxId: string;
	timeoutMs: number;
}) => Sandbox.connect(sandboxId, { apiKey, timeoutMs });

const findByMetadata = async ({
	apiKey,
	metadata,
}: {
	apiKey: string;
	metadata: Record<string, string>;
}) => {
	const paginator = Sandbox.list({
		apiKey,
		query: { metadata, state: ["running", "paused"] },
	});
	const matches = await paginator.nextItems();
	return matches[0];
};

// --- Thread-scoped tool sandbox (default template, no internet) ---

export const findOrCreateThreadSandbox = async ({
	apiKey,
	context,
	timeoutMs,
}: {
	apiKey: string;
	context: SandboxSessionContext;
	timeoutMs: number;
}) => {
	const existing = await findByMetadata({
		apiKey,
		metadata: threadSandboxLookupMetadata({ context }),
	});
	if (existing) {
		return connect({ apiKey, sandboxId: existing.sandboxId, timeoutMs });
	}
	return Sandbox.create({
		allowInternetAccess: false,
		apiKey,
		metadata: threadSandboxMetadata({ context }),
		network: { allowPublicTraffic: false },
		timeoutMs,
	});
};
