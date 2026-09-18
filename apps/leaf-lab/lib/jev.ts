import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const responseSchema = z.object({
	answers: z.record(z.object({ noul: z.number().min(0).max(1) })),
	usage: z
		.object({ input_tokens: z.number(), output_tokens: z.number() })
		.optional(),
});

export type JevMeasurement = {
	durationMs: number;
	inputTokens?: number;
	outputTokens?: number;
};

export const askJev = async ({
	state,
	questions,
	onMeasurement,
}: {
	state: unknown;
	questions: Record<string, string>;
	onMeasurement: (measurement: JevMeasurement) => void;
}): Promise<Record<string, number>> => {
	const key = process.env.TYPESAFE_API_KEY;
	if (!key) throw new Error("TYPESAFE_API_KEY is required for the Jev arm");
	const started = performance.now();
	const payload = {
		model: process.env.LEAF_LAB_JEV_MODEL ?? "jev-latest",
		state,
		questions: Object.fromEntries(
			Object.entries(questions).map(([id, instructions]) => [
				id,
				{ type: "noul", instructions },
			]),
		),
	};
	const directory = process.env.LEAF_LAB_REPORT_DIR;
	const tracePath = directory
		? resolve(directory, `${Date.now()}-${crypto.randomUUID()}-jev-call.json`)
		: undefined;
	if (directory) await mkdir(directory, { recursive: true, mode: 0o700 });
	if (tracePath)
		await writeFile(
			tracePath,
			JSON.stringify({ request: payload, status: "started" }, null, 2),
			{ mode: 0o600 },
		);
	const send = () =>
		fetch("https://api.typesafe.ai/v1/systemone", {
			method: "POST",
			headers: {
				authorization: `Bearer ${key}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(30_000),
		});
	let response = await send();
	let retried = false;
	if (response.status === 529 || response.status === 503) {
		await new Promise((resolve) => setTimeout(resolve, 1_500));
		response = await send();
		retried = true;
	}
	const responseText = await response.text();
	if (tracePath)
		await writeFile(
			tracePath,
			JSON.stringify(
				{
					request: payload,
					status: response.status,
					retriedAfterOverload: retried,
					response: responseText,
					durationMs: performance.now() - started,
				},
				null,
				2,
			),
			{ mode: 0o600 },
		);
	if (!response.ok)
		throw new Error(`Jev request failed (HTTP ${response.status})`);
	const parsed = responseSchema.parse(JSON.parse(responseText));
	onMeasurement({
		durationMs: performance.now() - started,
		inputTokens: parsed.usage?.input_tokens,
		outputTokens: parsed.usage?.output_tokens,
	});
	return Object.fromEntries(
		Object.keys(questions).map((id) => {
			const answer = parsed.answers[id];
			if (!answer) throw new Error(`Jev omitted required answer ${id}`);
			return [id, answer.noul];
		}),
	);
};
