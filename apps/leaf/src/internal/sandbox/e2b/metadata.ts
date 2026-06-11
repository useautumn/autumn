import type { SandboxSessionContext } from "../types.js";

const METADATA_APP = "leaf";

// --- Thread-scoped (Mastra runSandboxCommand tool) ---

export const threadSandboxKey = ({
	context,
}: {
	context: SandboxSessionContext;
}) =>
	[
		context.orgId,
		context.env,
		context.provider,
		context.workspaceId,
		context.channelId,
		context.threadId,
	].join(":");

export const threadSandboxMetadata = ({
	context,
}: {
	context: SandboxSessionContext;
}) => ({
	app: METADATA_APP,
	kind: "tool",
	channelId: context.channelId,
	env: context.env,
	orgId: context.orgId,
	provider: context.provider,
	threadId: context.threadId,
	threadKey: threadSandboxKey({ context }),
	workspaceId: context.workspaceId,
});

export const threadSandboxLookupMetadata = ({
	context,
}: {
	context: SandboxSessionContext;
}) => ({
	app: METADATA_APP,
	kind: "tool",
	threadKey: threadSandboxKey({ context }),
});
