import { spawn } from "node:child_process";

export type ProbeCall = {
	path: string;
	status: number;
	body: unknown;
};

export type ProbeResult = {
	booted: boolean;
	bootError?: string;
	calls: ProbeCall[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Boots the (agent-edited) fixture app in the workspace and replays a list of
 * requests against it, capturing statuses and bodies for the graders. The
 * server is killed afterward; the workspace is untouched.
 */
export const probeFixtureApp = async ({
	workspaceDir,
	port,
	requests,
	extraEnv = {},
}: {
	workspaceDir: string;
	port: number;
	requests: { path: string; method?: string; body?: unknown }[];
	extraEnv?: Record<string, string>;
}): Promise<ProbeResult> => {
	const child = spawn("bun", ["run", "src/index.ts"], {
		cwd: workspaceDir,
		env: { ...process.env, ...extraEnv, PORT: String(port) },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderrTail = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderrTail = `${stderrTail}${chunk}`.slice(-1500);
	});

	try {
		// Poll /health until the app is up (or give up).
		let booted = false;
		for (let attempt = 0; attempt < 30; attempt++) {
			try {
				const res = await fetch(`http://localhost:${port}/health`);
				if (res.ok) {
					booted = true;
					break;
				}
			} catch {
				// not up yet
			}
			await wait(200);
		}
		if (!booted) {
			return { booted: false, bootError: stderrTail.trim(), calls: [] };
		}

		const calls: ProbeCall[] = [];
		for (const request of requests) {
			try {
				const res = await fetch(`http://localhost:${port}${request.path}`, {
					method: request.method ?? "POST",
					headers: { "content-type": "application/json" },
					...(request.body !== undefined && {
						body: JSON.stringify(request.body),
					}),
				});
				const text = await res.text();
				let body: unknown = text;
				try {
					body = JSON.parse(text);
				} catch {
					// keep raw text
				}
				calls.push({ path: request.path, status: res.status, body });
			} catch (error) {
				calls.push({ path: request.path, status: 0, body: String(error) });
			}
		}
		return { booted: true, calls };
	} finally {
		child.kill("SIGKILL");
	}
};
