import type { AppEnv } from "@autumn/shared";
import type { TracingOptions } from "@mastra/core/observability";

const compact = (values: Array<string | null | undefined>) =>
	values.filter((value): value is string => Boolean(value));

export const createLeafTracingOptions = ({
	agentRunId,
	channelId,
	env,
	orgId,
	orgSlug,
	provider,
	source,
	threadId,
	workspaceId,
	setup,
}: {
	agentRunId?: string;
	channelId?: string;
	env?: AppEnv | string;
	orgId?: string;
	orgSlug?: string | null;
	provider?: string;
	source: "eval" | "prod";
	threadId?: string;
	workspaceId?: string;
	setup?: string;
}): TracingOptions => ({
	metadata: {
		agent_run_id: agentRunId,
		autumn_env: env,
		org_id: orgId,
		org_slug: orgSlug,
		provider,
		setup,
		slack_channel_id: channelId,
		slack_thread_id: threadId,
		slack_workspace_id: workspaceId,
		source,
	},
	tags: compact([
		source,
		env ? `autumn:${env}` : undefined,
		orgSlug ? `org:${orgSlug}` : undefined,
		provider ? `provider:${provider}` : undefined,
		setup ? `setup:${setup}` : undefined,
	]),
});
