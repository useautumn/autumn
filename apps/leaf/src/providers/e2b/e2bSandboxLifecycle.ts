import { Sandbox } from "e2b";
import type { SandboxSessionContext } from "../../agent/sandbox/types.js";
import {
	e2bSandboxLookupMetadata,
	e2bSandboxMetadata,
} from "./e2bSandboxMetadata.js";

export type E2bSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

export const findE2bSandbox = async ({
	apiKey,
	context,
}: {
	apiKey: string;
	context: SandboxSessionContext;
}) => {
	const paginator = Sandbox.list({
		apiKey,
		query: {
			metadata: e2bSandboxLookupMetadata({ context }),
			state: ["running", "paused"],
		},
	});
	const matches = await paginator.nextItems();
	return matches[0];
};

export const createE2bSandbox = ({
	apiKey,
	context,
	timeoutMs,
}: {
	apiKey: string;
	context: SandboxSessionContext;
	timeoutMs: number;
}) =>
	Sandbox.create({
		allowInternetAccess: false,
		apiKey,
		metadata: e2bSandboxMetadata({ context }),
		network: { allowPublicTraffic: false },
		timeoutMs,
	});

export const connectE2bSandbox = ({
	apiKey,
	sandboxId,
	timeoutMs,
}: {
	apiKey: string;
	sandboxId: string;
	timeoutMs: number;
}) =>
	Sandbox.connect(sandboxId, {
		apiKey,
		timeoutMs,
	});

export const findOrCreateE2bSandbox = async ({
	apiKey,
	context,
	timeoutMs,
}: {
	apiKey: string;
	context: SandboxSessionContext;
	timeoutMs: number;
}) => {
	const existing = await findE2bSandbox({ apiKey, context });
	if (existing) {
		return connectE2bSandbox({
			apiKey,
			sandboxId: existing.sandboxId,
			timeoutMs,
		});
	}

	return createE2bSandbox({ apiKey, context, timeoutMs });
};
