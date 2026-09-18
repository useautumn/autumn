import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type ProviderEvent = {
	usage?: unknown;
	provider?: string;
	id?: string;
	choices?: Array<{
		delta?: {
			reasoning?: string;
			reasoning_content?: string;
			content?: string;
			tool_calls?: Array<{ function?: { arguments?: string } }>;
		};
	}>;
};

const traceModelRequest = async (
	input: string | URL | Request,
	init?: RequestInit,
) => {
	const directory = process.env.LEAF_LAB_REPORT_DIR;
	if (!directory) return fetch(input, init);
	await mkdir(directory, { recursive: true });
	const id = `${process.env.LEAF_LAB_RUN_ID ?? "model"}-${crypto.randomUUID()}`;
	const path = resolve(directory, `${id}-provider`);
	await writeFile(`${path}-request.json`, String(init?.body ?? ""), {
		mode: 0o600,
	});
	const started = performance.now();
	const timing: Record<string, unknown> = {
		startedAt: new Date().toISOString(),
	};
	let lineBuffer = "";
	const persist = () =>
		writeFile(`${path}-timing.json`, JSON.stringify(timing, null, 2), {
			mode: 0o600,
		});
	try {
		const response = await fetch(input, init);
		timing.headersMs = performance.now() - started;
		timing.status = response.status;
		await writeFile(`${path}-response.sse`, "", { mode: 0o600 });
		if (!response.body) {
			timing.completedMs = performance.now() - started;
			await persist();
			return response;
		}
		const decoder = new TextDecoder();
		const reader = response.body.getReader();
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const chunk = await reader.read();
					if (chunk.done) {
						timing.completedMs = performance.now() - started;
						await persist();
						controller.close();
						return;
					}
					const elapsed = performance.now() - started;
					timing.firstByteMs ??= elapsed;
					lineBuffer += decoder.decode(chunk.value, { stream: true });
					const lines = lineBuffer.split("\n");
					lineBuffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
						let event: ProviderEvent;
						try {
							event = JSON.parse(line.slice(6));
						} catch {
							continue;
						}
						if (event.usage) timing.usage = event.usage;
						if (event.provider) timing.provider = event.provider;
						if (event.id) timing.responseId = event.id;
						for (const choice of event.choices ?? []) {
							const delta = choice.delta;
							if (delta?.reasoning || delta?.reasoning_content)
								timing.firstReasoningMs ??= elapsed;
							if (
								delta?.content ||
								delta?.tool_calls?.some(
									(call: { function?: { arguments?: string } }) =>
										call.function?.arguments,
								)
							)
								timing.firstOutputMs ??= elapsed;
						}
					}
					await appendFile(`${path}-response.sse`, chunk.value);
					controller.enqueue(chunk.value);
				} catch (error) {
					timing.error = String(error);
					timing.completedMs = performance.now() - started;
					await persist();
					controller.error(error);
				}
			},
			async cancel(reason) {
				timing.cancelled = true;
				timing.completedMs = performance.now() - started;
				await persist();
				await reader.cancel(reason);
			},
		});
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	} catch (error) {
		timing.error = String(error);
		timing.completedMs = performance.now() - started;
		await persist();
		throw error;
	}
};

export const modelTraceFetch = Object.assign(traceModelRequest, {
	preconnect: fetch.preconnect,
});
