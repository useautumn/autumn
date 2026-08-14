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

export type EveAction = z.infer<typeof eveActionSchema>;
export type EveActionResult = z.infer<typeof eveActionResultSchema>;
export type EveInputRequest = z.infer<typeof eveInputRequestSchema>;

type EventBase = { at?: string };
export type EveEvent = EventBase &
	(
		| ({ type: "message.received" } & z.infer<typeof messageReceivedSchema>)
		| ({ type: "actions.requested" } & z.infer<typeof actionsRequestedSchema>)
		| ({ type: "action.result" } & z.infer<typeof actionResultSchema>)
		| ({ type: "input.requested" } & z.infer<typeof inputRequestedSchema>)
		| ({ type: "reasoning.completed" } & z.infer<
				typeof reasoningCompletedSchema
		  >)
		| ({ type: "message.appended" } & z.infer<typeof messageAppendedSchema>)
		| ({ type: "message.completed" } & z.infer<typeof messageCompletedSchema>)
		| ({ type: "turn.failed" } & z.infer<typeof failureSchema>)
		| ({ type: "session.failed" } & z.infer<typeof failureSchema>)
		| { type: "turn.started" }
		| { type: "turn.completed" }
		| { type: "step.started" }
		| { type: "session.waiting" }
		| { type: "session.completed" }
		| { type: "unknown"; eventType: string }
	);

export const parseEveEvent = (value: unknown): EveEvent => {
	const envelope = eveEventEnvelopeSchema.parse(value);
	const at = envelope.meta?.at;
	const data = envelope.data ?? {};
	switch (envelope.type) {
		case "message.received":
			return { at, type: envelope.type, ...messageReceivedSchema.parse(data) };
		case "actions.requested":
			return { at, type: envelope.type, ...actionsRequestedSchema.parse(data) };
		case "action.result":
			return { at, type: envelope.type, ...actionResultSchema.parse(data) };
		case "input.requested":
			return { at, type: envelope.type, ...inputRequestedSchema.parse(data) };
		case "reasoning.completed":
			return {
				at,
				type: envelope.type,
				...reasoningCompletedSchema.parse(data),
			};
		case "message.appended":
			return { at, type: envelope.type, ...messageAppendedSchema.parse(data) };
		case "message.completed":
			return {
				at,
				type: envelope.type,
				...messageCompletedSchema.parse(data),
			};
		case "turn.failed":
		case "session.failed":
			return { at, type: envelope.type, ...failureSchema.parse(data) };
		case "turn.started":
		case "turn.completed":
		case "step.started":
		case "session.waiting":
		case "session.completed":
			return { at, type: envelope.type };
		default:
			return { at, eventType: envelope.type, type: "unknown" };
	}
};
