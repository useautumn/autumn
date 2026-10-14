import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { INGRESS_PORT, TW_ENV, WORKER_TIMEOUT_MS } from "../constants.ts";
import { readInlineBunScript } from "./inlineBunScript.ts";
import { sinkLine } from "./logSink.ts";
import {
	createIngressSandbox,
	getPublicUrl,
	isSandboxStreamClosed,
	type ProviderSandbox,
	runDetached,
} from "./provider.ts";

const INGRESS_SCRIPT = "scripts/tw/ingress/server.mjs";
const INGRESS_CWD = "/tmp";

const INGRESS_HEALTH_TIMEOUT_MS = 90_000;
const INGRESS_HEALTH_POLL_MS = 1500;

const HTTP_OK = 200;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const log = (message: string): void => {
	sinkLine(chalk.cyan(`[tw] ${message}`));
};

export type CreateIngressResult = {
	sandbox: ProviderSandbox;
	publicUrl: string;
	token: string;
};

export const createIngress = async ({
	owner,
	runId,
	signal,
}: {
	owner: string;
	runId: string;
	signal: AbortSignal;
}): Promise<CreateIngressResult> => {
	const name = `tw-ingress-${runId}`;
	const token = randomUUID();

	log(`ingress: creating sandbox ${name}`);
	const sandbox = await createIngressSandbox({
		name,
		ports: [INGRESS_PORT],
		timeout: WORKER_TIMEOUT_MS,
		vcpus: 1,
		tags: { kind: "bun-tw-ingress", owner, run: runId },
		env: {
			INGRESS_TOKEN: token,
			INGRESS_PORT: String(INGRESS_PORT),
			TW_ENV,
		},
		signal,
	});

	const publicUrl = await getPublicUrl(sandbox, INGRESS_PORT);

	const ingressCommand = await runDetached(
		sandbox,
		["bun", "-e", readInlineBunScript(INGRESS_SCRIPT)],
		{
			cwd: INGRESS_CWD,
			onChunk: (text) =>
				sinkLine(chalk.gray(`[ingress] ${text.replace(/\n$/, "")}`)),
			signal,
		},
	);

	void ingressCommand
		.wait({ signal })
		.catch((error: unknown) => {
			if (isSandboxStreamClosed(error)) {
				return;
			}
			throw error;
		})
		.catch(() => {});

	const deadline = Date.now() + INGRESS_HEALTH_TIMEOUT_MS;
	for (;;) {
		if (signal.aborted) {
			throw new Error("ingress: aborted while waiting for /health");
		}
		try {
			const response = await fetch(`${publicUrl}/health`, { signal });
			if (response.status === HTTP_OK) {
				log(`ingress: ${name} healthy at ${publicUrl}`);
				return { sandbox, publicUrl, token };
			}
		} catch {}
		if (Date.now() >= deadline) {
			throw new Error(
				`ingress ${name} did not become healthy within ${INGRESS_HEALTH_TIMEOUT_MS}ms (${publicUrl}/health)`,
			);
		}
		await sleep(INGRESS_HEALTH_POLL_MS);
	}
};

export const pushWorkerMapping = async ({
	ingressUrl,
	token,
	accountId,
	workerUrl,
}: {
	ingressUrl: string;
	token: string;
	accountId: string;
	workerUrl: string;
}): Promise<void> => {
	const response = await fetch(`${ingressUrl}/ingress/map`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-ingress-token": token,
		},
		body: JSON.stringify({ accountId, workerUrl }),
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`ingress map push for account ${accountId} failed: ${response.status} ${body}`,
		);
	}
};
