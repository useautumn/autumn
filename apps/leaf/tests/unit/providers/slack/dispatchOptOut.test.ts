import { describe, expect, mock, test } from "bun:test";
import {
	closeRun,
	registerRun,
} from "../../../../src/internal/runs/runRegistry.js";
import { dispatchSlackAgentMessage } from "../../../../src/providers/slack/actions/dispatchSlackAgentMessage.js";

const target = { post: mock(async () => ({ id: "m1" })) };

describe("dispatchSlackAgentMessage opt-out", () => {
	test("explicit opt-out closes the thread without starting a run", async () => {
		const reactions: string[] = [];
		const disposition = await dispatchSlackAgentMessage({
			channelId: "C9",
			providerUserId: "U1",
			raw: { team_id: "T9" },
			react: async ({ action, emoji }) => {
				reactions.push(`${action}:${emoji}`);
			},
			target: target as never,
			text: "<@U0BOT> stop replying",
			threadId: "slack:C9:1",
		});

		expect(disposition).toBe("close");
		expect(reactions).toEqual(["remove:eyes", "add:white_check_mark"]);
		expect(target.post).not.toHaveBeenCalled();
	});

	test("explicit opt-out stops the thread's active run", async () => {
		const run = registerRun({
			key: "slack:T9:C9:slack:C9:2",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_9");

		const disposition = await dispatchSlackAgentMessage({
			channelId: "C9",
			providerUserId: "U2",
			raw: { team_id: "T9" },
			target: target as never,
			text: "stop replying please",
			threadId: "slack:C9:2",
		});

		expect(disposition).toBe("close");
		expect(run.stop).toEqual({ byUserId: "U2", reason: "user" });
		closeRun({ key: run.key, run });
	});
});
