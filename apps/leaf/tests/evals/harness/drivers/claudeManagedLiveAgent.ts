import Anthropic from "@anthropic-ai/sdk";
import { AppEnv } from "@autumn/shared";
import { defaultGenericMcpAgentConfig } from "../configs/genericMcpAgentConfig.js";
import { createLiveSessionDriver } from "./claudeManagedLive/sessionDriver.js";
import {
	ensureEvalAgent,
	loadMcpMetadata,
	toMessage,
} from "./claudeManagedLive/setup.js";
import { openMockTunnel } from "./claudeManagedLive/tunnel.js";
import type { EvalAgentDriver, EvalDriverStartInput } from "./types.js";

// Real Claude Managed Agents eval driver. Exercises the ACTUAL CMA harness (session
// + the prod driveSessionTurn + tool_confirmation) against the deterministic eval
// mock, reached by Anthropic's cloud loop via an ngrok tunnel. Opt-in
// (EVAL_CMA_LIVE); the in-process driver stays the fast default. The mock injects
// auth server-side, so no vault is needed.
export const createClaudeManagedLiveDriver = ({
	model = defaultGenericMcpAgentConfig.model,
}: {
	model?: string;
} = {}): EvalAgentDriver => ({
	name: "claude-managed-live",
	start: async ({ context, today, trace }: EvalDriverStartInput) => {
		const env = context.auth.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
		const mockUrl = context.mcpServer.url;

		const tunnel = await openMockTunnel({ mockPort: Number(mockUrl.port) });
		const { destructiveTools } = await loadMcpMetadata({
			url: mockUrl,
		});

		const client = new Anthropic();
		const { agentId, environmentId } = await ensureEvalAgent({
			client,
			destructiveTools,
			env,
			mcpUrl: tunnel.mcpUrl,
			model,
			today,
		});
		const session = await client.beta.sessions.create({
			agent: agentId,
			environment_id: environmentId,
		});

		const driver = createLiveSessionDriver({
			client,
			sessionId: session.id,
			trace,
		});
		return {
			approve: driver.approve,
			cleanup: tunnel.close,
			getToolCalls: driver.getToolCalls,
			hasPendingApproval: driver.hasPendingApproval,
			send: (message) => driver.send(toMessage(message)),
		};
	},
});
