import type { SandboxSessionContext } from "../../agent/sandbox/types.js";

const metadataApp = "leaf";

export const e2bThreadKey = ({ context }: { context: SandboxSessionContext }) =>
	[
		context.orgId,
		context.env,
		context.provider,
		context.workspaceId,
		context.channelId,
		context.threadId,
	].join(":");

export const e2bSandboxMetadata = ({
	context,
}: {
	context: SandboxSessionContext;
}) => ({
	app: metadataApp,
	channelId: context.channelId,
	env: context.env,
	orgId: context.orgId,
	provider: context.provider,
	threadId: context.threadId,
	threadKey: e2bThreadKey({ context }),
	workspaceId: context.workspaceId,
});

export const e2bSandboxLookupMetadata = ({
	context,
}: {
	context: SandboxSessionContext;
}) => {
	const metadata = e2bSandboxMetadata({ context });
	return {
		app: metadata.app,
		threadKey: metadata.threadKey,
	};
};
