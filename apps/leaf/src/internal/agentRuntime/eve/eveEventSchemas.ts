import { z } from "zod";

const eveActionSchema = z.object({
	callId: z.string().optional(),
	description: z.string().optional(),
	input: z.record(z.string(), z.unknown()).optional(),
	kind: z.string().optional(),
	name: z.string().optional(),
	subagentName: z.string().optional(),
	toolName: z.string().optional(),
});

const eveActionResultSchema = z.object({
	callId: z.string().optional(),
	kind: z.string().optional(),
	name: z.string().optional(),
	output: z.unknown().optional(),
	subagentName: z.string().optional(),
	toolName: z.string().optional(),
});

const eveInputRequestSchema = z.object({
	action: z
		.object({
			callId: z.string().optional(),
			input: z.record(z.string(), z.unknown()).optional(),
			kind: z.string().optional(),
			toolName: z.string().optional(),
		})
		.optional(),
	display: z.string().optional(),
	options: z
		.array(
			z.object({
				id: z.string().optional(),
				label: z.string().optional(),
			}),
		)
		.optional(),
	prompt: z.string().optional(),
	requestId: z.string().optional(),
});

const eveEventEnvelopeSchema = z.object({
	data: z.unknown().optional(),
	meta: z.object({ at: z.string().optional() }).optional(),
	type: z.string(),
});

const turnDataSchema = z.object({ turnId: z.string().optional() });
const messageReceivedSchema = turnDataSchema.extend({
	message: z.string().default(""),
});
const actionsRequestedSchema = turnDataSchema.extend({
	actions: z.array(eveActionSchema).default([]),
});
const actionResultSchema = turnDataSchema.extend({
	result: eveActionResultSchema.optional(),
	status: z.string().optional(),
});
const inputRequestedSchema = turnDataSchema.extend({
	requests: z.array(eveInputRequestSchema).default([]),
});
const reasoningCompletedSchema = turnDataSchema.extend({
	reasoning: z.string().default(""),
});
const messageAppendedSchema = turnDataSchema.extend({
	messageDelta: z.string().default(""),
	messageSoFar: z.string().optional(),
});
const messageCompletedSchema = turnDataSchema.extend({
	finishReason: z.string().optional(),
	message: z.string().default(""),
});
const failureSchema = z.object({ message: z.string().default("Eve failed") });
/** A declared subagent was delegated to; the child runs its own session,
 * reachable at /eve/v1/session/<childSessionId>/stream. */
const subagentCalledSchema = z.object({
	callId: z.string().optional(),
	childSessionId: z.string().optional(),
	name: z.string().optional(),
	toolName: z.string().optional(),
});

/** Only the event's arrival matters today — it marks resumed-turn activity;
 * the child's output is read from its own stream, not from this event. */
const subagentCompletedSchema = z.object({
	callId: z.string().optional(),
	subagentName: z.string().optional(),
});

const emptyEventSchema = z.object({});

export type EveAction = z.infer<typeof eveActionSchema>;
export type EveActionResult = z.infer<typeof eveActionResultSchema>;
export type EveInputRequest = z.infer<typeof eveInputRequestSchema>;

const eveEventSchema = eveEventEnvelopeSchema.transform((envelope) => {
	const data = envelope.data ?? {};
	const metadata = envelope.meta?.at ? { at: envelope.meta.at } : {};
	const event = <Type extends string, Schema extends z.AnyZodObject>({
		schema,
		type,
	}: {
		schema: Schema;
		type: Type;
	}): { at?: string; type: Type } & z.output<Schema> => ({
		...metadata,
		type,
		...schema.parse(data),
	});

	switch (envelope.type) {
		case "subagent.called":
			return event({ schema: subagentCalledSchema, type: envelope.type });
		case "subagent.completed":
			return event({ schema: subagentCompletedSchema, type: envelope.type });
		case "message.received":
			return event({ schema: messageReceivedSchema, type: envelope.type });
		case "actions.requested":
			return event({ schema: actionsRequestedSchema, type: envelope.type });
		case "action.result":
			return event({ schema: actionResultSchema, type: envelope.type });
		case "input.requested":
			return event({ schema: inputRequestedSchema, type: envelope.type });
		case "reasoning.completed":
			return event({ schema: reasoningCompletedSchema, type: envelope.type });
		case "message.appended":
			return event({ schema: messageAppendedSchema, type: envelope.type });
		case "message.completed":
			return event({ schema: messageCompletedSchema, type: envelope.type });
		case "step.failed":
			return event({ schema: failureSchema, type: envelope.type });
		case "turn.failed":
			return event({ schema: failureSchema, type: envelope.type });
		case "session.failed":
			return event({ schema: failureSchema, type: envelope.type });
		case "turn.started":
			return event({ schema: emptyEventSchema, type: envelope.type });
		case "turn.completed":
			return event({ schema: emptyEventSchema, type: envelope.type });
		case "step.started":
			return event({ schema: emptyEventSchema, type: envelope.type });
		case "session.waiting":
			return event({ schema: emptyEventSchema, type: envelope.type });
		case "session.completed":
			return event({ schema: emptyEventSchema, type: envelope.type });
		default:
			return {
				...metadata,
				eventType: envelope.type,
				type: "unknown",
			} as const;
	}
});

export type EveEvent = z.infer<typeof eveEventSchema>;

export const parseEveEvent = (value: unknown) => eveEventSchema.parse(value);
