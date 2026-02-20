import { execSync, spawn } from "node:child_process";

/**
 * Executes a command asynchronously, capturing output and returning it.
 * Used for parallel execution where we don't want interleaved output.
 */
export function execAsyncQuiet({
	command,
	args,
	cwd,
	label,
}: {
	command: string;
	args: string[];
	cwd: string;
	label: string;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd,
			stdio: ["inherit", "pipe", "pipe"],
			shell: true,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				reject(new Error(`${label} failed with exit code ${code}\n${stderr}`));
			}
		});

		proc.on("error", (err) => {
			reject(new Error(`${label} failed: ${err.message}`));
		});
	});
}

/**
 * Executes a command synchronously with inherited stdio.
 */
export function exec({ command, cwd }: { command: string; cwd: string }): void {
	execSync(command, { stdio: "inherit", cwd });
}
