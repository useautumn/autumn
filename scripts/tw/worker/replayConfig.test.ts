import { expect, test } from "bun:test";
import { EDGE_CONFIG_OVERRIDE_B64 } from "../constants";

test("TW workers consume webhook replay without enabling unrelated recovery queues", async () => {
	const child = Bun.spawn(
		[
			process.execPath,
			"--eval",
			`
		const { isJobQueueEnabled, JOB_QUEUE_IDS } = await import("./src/internal/misc/jobQueues/jobQueueStore.ts");
		console.log(JSON.stringify({
			replay: isJobQueueEnabled({ queue: JOB_QUEUE_IDS.stripeWebhookReplay, defaultEnabled: false }),
			customerRecovery: isJobQueueEnabled({ queue: JOB_QUEUE_IDS.customerCreationRecovery, defaultEnabled: false }),
			primary: isJobQueueEnabled({ queue: JOB_QUEUE_IDS.primary }),
		}));
	`,
		],
		{
			cwd: new URL("../../../server/", import.meta.url).pathname,
			env: {
				...process.env,
				AUTUMN_EDGE_CONFIG_OVERRIDE_B64: EDGE_CONFIG_OVERRIDE_B64,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
	expect(JSON.parse(stdout.trim())).toEqual({
		replay: true,
		customerRecovery: false,
		primary: true,
	});
});
