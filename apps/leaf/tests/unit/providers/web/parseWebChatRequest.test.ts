import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { parseWebChatRequest } from "../../../../src/providers/web/parseWebChatRequest.js";

describe("parseWebChatRequest", () => {
	test("reads the latest user message into agent input", () => {
		const messages = [
			{
				id: "assistant_1",
				parts: [{ text: "How can I help?", type: "text" }],
				role: "assistant",
			},
			{
				id: "user_1",
				parts: [{ text: "Old request", type: "text" }],
				role: "user",
			},
			{
				id: "user_2",
				metadata: {
					catalogDecision: { planId: "pro", versioning: "create_version" },
					questionResponse: { optionId: "yes", requestId: "req_1" },
				},
				parts: [
					{ text: "Attach ", type: "text" },
					{ text: "Pro", type: "text" },
					{
						filename: "note.txt",
						mediaType: "text/plain",
						type: "file",
						url: `data:text/plain;base64,${Buffer.from("hello").toString("base64")}`,
					},
				],
				role: "user",
			},
		] as UIMessage[];

		const parsed = parseWebChatRequest({ id: "thread_1", messages });

		expect(parsed).toMatchObject({
			clientContext: {
				catalogDecision: { planId: "pro", versioning: "create_version" },
			},
			conversationId: "thread_1",
			isFirstUserMessage: false,
			questionResponse: { optionId: "yes", requestId: "req_1" },
			text: "Attach Pro",
		});
		expect(parsed.attachments).toHaveLength(1);
		expect(parsed.attachments[0]).toMatchObject({
			mimeType: "text/plain",
			name: "note.txt",
		});
		expect(parsed.attachments[0]?.data).toEqual(Buffer.from("hello"));
	});

	test("ignores malformed optional input without throwing", () => {
		expect(parseWebChatRequest({ messages: null })).toEqual({
			attachments: [],
			clientContext: undefined,
			conversationId: undefined,
			isFirstUserMessage: true,
			questionResponse: undefined,
			text: "",
		});

		const parsed = parseWebChatRequest({
			messages: [
				{
					id: "user_1",
					metadata: {
						catalogDecision: { planId: "pro" },
						questionResponse: { optionId: 7, requestId: "req_1" },
					},
					parts: [
						{ text: "Continue", type: "text" },
						{
							filename: "remote.txt",
							mediaType: "text/plain",
							type: "file",
							url: "https://example.com/remote.txt",
						},
					],
					role: "user",
				} as UIMessage,
			],
		});

		expect(parsed).toMatchObject({
			attachments: [],
			clientContext: undefined,
			isFirstUserMessage: true,
			questionResponse: undefined,
			text: "Continue",
		});
	});
});
