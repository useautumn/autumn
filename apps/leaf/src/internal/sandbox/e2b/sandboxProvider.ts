import type {
	SandboxProvider,
	SandboxRunResult,
	SandboxSessionContext,
} from "../types.js";
import {
	e2bWorkDir,
	ensureE2bDir,
	readRequestedE2bFiles,
	writeE2bSandboxFiles,
} from "./files.js";
import { findOrCreateThreadSandbox } from "./lifecycle.js";

/** The thread-scoped code-execution provider behind the Mastra runSandboxCommand tool. */
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
		const sandbox = await findOrCreateThreadSandbox({
			apiKey,
			context,
			timeoutMs: sessionTimeoutMs,
		});
		try {
			await ensureE2bDir({ path: e2bWorkDir, sandbox });
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
