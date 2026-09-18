import { appendFile, mkdir, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Client, type MessageResponse } from "eve/client";
import { cleanupOwnedHosts } from "../scripts/suite.js";
import { startNativeBridge } from "./lib/bridge.js";

const root = resolve(import.meta.dirname, "runtime-fixture");
const reportDir = resolve(
	homedir(),
	".capy/work/leaf-lab-full/native",
	`runtime-check-${Date.now()}`,
);
await mkdir(reportDir, { recursive: true });
await mkdir(resolve(root, "node_modules"), { recursive: true });
await symlink(
	resolve(import.meta.dirname, "../node_modules/eve"),
	resolve(root, "node_modules/eve"),
	"dir",
).catch((error: NodeJS.ErrnoException) => {
	if (error.code !== "EEXIST") throw error;
});
const reservation = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: () => new Response(),
});
const port = reservation.port;
reservation.stop(true);
if (!port) throw new Error("No local runtime test port");
const bridge = await startNativeBridge({ mode: "flash", reportDir });
const host = Bun.spawn(
	[
		"node",
		resolve(root, "node_modules/eve/bin/eve.js"),
		"dev",
		"--no-ui",
		"--port",
		String(port),
	],
	{
		cwd: root,
		env: {
			...process.env,
			NODE_ENV: "development",
			LEAF_NATIVE_HOST_URL: `http://127.0.0.1:${port}`,
			LEAF_NATIVE_BRIDGE_URL: bridge.url,
			LEAF_NATIVE_BRIDGE_TOKEN: bridge.token,
		},
		stdout: Bun.file(resolve(reportDir, "host.log")),
		stderr: Bun.file(resolve(reportDir, "host.log")),
	},
);
const consume = async (response: MessageResponse) => {
	const events = [];
	for await (const event of response) {
		events.push(event);
		await appendFile(
			resolve(reportDir, "events.jsonl"),
			`${JSON.stringify(event)}\n`,
			{ mode: 0o600 },
		);
	}
	return events;
};
try {
	const client = new Client({ host: `http://127.0.0.1:${port}` });
	const deadline = Date.now() + 90_000;
	while (true) {
		if (host.exitCode !== null) throw new Error("Keyless native host exited");
		try {
			await client.health();
			break;
		} catch {
			if (Date.now() > deadline)
				throw new Error("Keyless native host health timeout");
			await Bun.sleep(300);
		}
	}
	const first = await client.sessions.create({
		message: "propose",
		signal: AbortSignal.timeout(30_000),
	});
	const initial = await consume(first.response);
	if (!initial.some((event) => event.type === "input.requested"))
		throw new Error("Initial proposal did not genuinely park");
	const question = await consume(
		await first.session.send("question", {
			turnPolicy: "steer",
			signal: AbortSignal.timeout(30_000),
		}),
	);
	if (
		question.some((event) => event.type === "input.resolved") ||
		!question.some((event) => event.type === "message.completed")
	)
		throw new Error("Question did not retain the original pending approval");
	const refinement = await consume(
		await first.session.send("refine", {
			turnPolicy: "steer",
			signal: AbortSignal.timeout(30_000),
		}),
	);
	const replacement = refinement
		.flatMap((event) =>
			event.type === "input.requested" ? event.data.requests : [],
		)
		.some((request) => request.action.callId === "new-write");
	const replacementRequest = refinement
		.flatMap((event) =>
			event.type === "input.requested" ? event.data.requests : [],
		)
		.find((request) => request.action.callId === "new-write");
	const payload = replacementRequest?.action.input.request as
		| {
				customize?: { price?: { amount?: number } };
				free_trial?: { duration_length?: number };
		  }
		| undefined;
	if (
		payload?.customize?.price?.amount !== 1035 ||
		payload.free_trial?.duration_length !== 14
	)
		throw new Error("The replacement lost the requested price or trial");
	const original = initial
		.flatMap((event) =>
			event.type === "input.requested" ? event.data.requests : [],
		)
		.find((request) => request.action.callId === "old-write");
	const oldAuthorization = await fetch(new URL("/authorize", bridge.url), {
		method: "POST",
		headers: {
			authorization: `Bearer ${bridge.token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			sessionId: first.session.state.sessionId,
			callId: "old-write",
			name: "attach",
			args: original?.action.input,
		}),
	});
	if (oldAuthorization.status !== 422)
		throw new Error("The canceled original proposal remained approvable");
	const cancelled = refinement.some(
		(event) =>
			event.type === "input.resolved" &&
			event.data.resolutions.some(
				(resolution) => resolution.outcome === "denied",
			),
	);
	await writeFile(
		resolve(reportDir, "result.json"),
		JSON.stringify(
			{
				replacement,
				cancelled,
				genuineSdkEvents: true,
				paidModelCalls: 0,
				questionRetainedOriginal: true,
				oldApprovalRejected: true,
				replacementPayload: payload,
				sessionId: first.session.state.sessionId,
			},
			null,
			2,
		),
	);
	if (!replacement || !cancelled)
		throw new Error(
			"SDK did not cancel and replace within the refinement turn",
		);
	console.log(`Keyless genuine approval supersession passed: ${reportDir}`);
} catch (error) {
	await writeFile(
		resolve(reportDir, "error.json"),
		JSON.stringify({ error: String(error), paidModelCalls: 0 }, null, 2),
	);
	console.error(`Keyless native lifecycle failed; evidence: ${reportDir}`);
	throw error;
} finally {
	await cleanupOwnedHosts(root, reportDir);
	if (host.exitCode === null) host.kill("SIGKILL");
	await host.exited;
	await bridge.close();
}
