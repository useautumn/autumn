/** Headless warm child: builds + publishes tw-warm:<sha12> via scripts/tw's warm path. */
import { setLogSubscriber } from "@tw/helpers/logSink.ts";
import { warmImageExists, warmImageTag } from "../../modal/modalClient.ts";
import { loadTwModules } from "../../swarm/swarmProcess/twModules.ts";
import type { WarmChildMessage, WarmInit } from "../../types/swarmMessages.ts";

const finish = async ({
	message,
	exitCode,
}: {
	message: WarmChildMessage;
	exitCode: number;
}) => {
	process.send?.(message);
	await Bun.sleep(500);
	process.exit(exitCode);
};

const main = async ({ sha }: WarmInit) => {
	// run.ts sizes a Stripe budget at import; the warm build never talks to Stripe.
	process.env.STRIPE_TEST_KEY_POOL ||= "sk_test_twd_warm_unused";
	setLogSubscriber((line) => {
		if (line.trim()) process.send?.({ type: "log", text: line });
	});
	const tw = await loadTwModules();
	await tw.provider.setProvider("modalv2");

	const abort = new AbortController();
	process.once("SIGTERM", () => abort.abort());
	await tw.run.getOrBuildWarmParent({ ref: sha, sha, signal: abort.signal });

	// scripts/tw swallows publish failures (the local run still works); twd needs the tag.
	if (!(await warmImageExists({ sha }))) {
		throw new Error(
			`warm build finished but ${warmImageTag({ sha })} was not published`,
		);
	}
};

process.once("message", (init: WarmInit) => {
	main(init)
		.then(() =>
			finish({
				message: {
					type: "done",
					ok: true,
					imageTag: warmImageTag({ sha: init.sha }),
				},
				exitCode: 0,
			}),
		)
		.catch((error: unknown) =>
			finish({
				message: {
					type: "done",
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				},
				exitCode: 1,
			}),
		);
});
process.send?.({ type: "ready" });
