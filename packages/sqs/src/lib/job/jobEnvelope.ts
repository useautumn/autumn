import { z } from "zod/v4";
import { InvalidJobError, UnknownJobError } from "./jobErrors.js";
import type { JobDefinition, JobEnvelope, ParsedJob } from "./types/job.js";

const jobEnvelopeSchema = z.object({
	id: z.string().optional(),
	name: z.string(),
	data: z.unknown(),
});

/** The message exactly as the server has always sent it. */
export const serializeJobEnvelope = ({
	id,
	name,
	payload,
}: {
	id?: string;
	name: string;
	payload: unknown;
}): string =>
	JSON.stringify({
		...(id && { id }),
		name,
		data: payload,
	} satisfies JobEnvelope);

/** A message body back into the job it names, validated against that job's schema. */
export const parseJobEnvelope = <const TJobs extends readonly JobDefinition[]>({
	body,
	jobs,
}: {
	body: string;
	jobs: TJobs;
}): ParsedJob<TJobs> => {
	let envelope: JobEnvelope;
	try {
		envelope = jobEnvelopeSchema.parse(JSON.parse(body));
	} catch (cause) {
		throw new InvalidJobError({ cause });
	}
	const definition = jobs.find((candidate) => candidate.name === envelope.name);
	if (!definition) throw new UnknownJobError({ jobName: envelope.name });

	const payload = definition.payload.safeParse(envelope.data);
	if (!payload.success) {
		throw new InvalidJobError({ name: definition.name, cause: payload.error });
	}
	return {
		id: envelope.id,
		name: definition.name,
		payload: payload.data,
	} as ParsedJob<TJobs>;
};
