import type {
	SandboxProvider,
	SandboxRunResult,
	SandboxSessionContext,
} from "../../agent/sandbox/types.js";
import {
	e2bWorkDir,
	ensureE2bWorkDir,
	readRequestedE2bFiles,
	writeE2bSandboxFiles,
} from "./e2bSandboxFiles.js";
import { findOrCreateE2bSandbox } from "./e2bSandboxLifecycle.js";

export const createE2bSandboxProvider = ({
	apiKey,
	context,
	sessionTimeoutMs,
}: {
	apiKey: string;
	context: SandboxSessionContext;
	sessionTimeoutMs: number;
}): SandboxProvider => ({
	run: async ({ command, files, returnFiles, timeoutMs }) => {
		const sandbox = await findOrCreateE2bSandbox({
			apiKey,
			context,
			timeoutMs: sessionTimeoutMs,
		});
		try {
			await ensureE2bWorkDir({ sandbox });
			await writeE2bSandboxFiles({ files, sandbox });
			const result = await sandbox.commands.run(command, {
				cwd: e2bWorkDir,
				timeoutMs,
			});
			return {
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				exitCode: result.exitCode,
				timedOut: false,
				files: await readRequestedE2bFiles({ returnFiles, sandbox }),
			} satisfies SandboxRunResult;
		} catch (error) {
			const timedOut =
				error instanceof Error && /timeout|timed out/i.test(error.message);
			if (!timedOut) throw error;
			return {
				stdout: "",
				stderr: "Sandbox command timed out",
				timedOut: true,
				files: await readRequestedE2bFiles({ returnFiles, sandbox }),
			};
		}
	},
});
