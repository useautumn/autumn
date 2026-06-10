import { afterEach, describe, expect, test } from "bun:test";
import type { Attachment } from "chat";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "../../../../src/providers/slack/files.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Slack file helpers", () => {
	test("extracts Slack file metadata from raw messages", () => {
		expect(
			getSlackFilesFromRaw({
				raw: {
					files: [
						{
							id: "F1",
							mimetype: "application/pdf",
							name: "contract.pdf",
							size: 123,
							url_private: "https://files.slack.com/contract.pdf",
						},
						null,
					],
				},
			}),
		).toEqual([
			{
				id: "F1",
				mimetype: "application/pdf",
				name: "contract.pdf",
				size: 123,
				url_private: "https://files.slack.com/contract.pdf",
			},
		]);
	});

	test("downloads fallback Slack private URLs with bot auth", async () => {
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("https://files.slack.com/contract.pdf");
			expect(init?.headers).toEqual({ Authorization: "Bearer xoxb-test" });
			return new Response("pdf");
		}) as typeof fetch;

		const data = await fetchSlackAttachmentFallback({
			attachment: {
				mimeType: "application/pdf",
				name: "contract.pdf",
				size: 3,
				type: "file",
			} satisfies Attachment,
			botToken: "xoxb-test",
			rawFiles: [
				{
					id: "F1",
					mimetype: "application/pdf",
					name: "contract.pdf",
					size: 3,
					url_private: "https://files.slack.com/contract.pdf",
				},
			],
		});

		expect(data?.toString()).toBe("pdf");
	});

	test("looks up url_private with files.info when raw URL is missing", async () => {
		const calls: string[] = [];
		globalThis.fetch = (async (url, init) => {
			calls.push(String(url));
			expect(init?.headers).toEqual({ Authorization: "Bearer xoxb-test" });
			if (String(url).startsWith("https://slack.com/api/files.info")) {
				return Response.json({
					ok: true,
					file: { url_private: "https://files.slack.com/contract.pdf" },
				});
			}
			return new Response("pdf");
		}) as typeof fetch;

		const data = await fetchSlackAttachmentFallback({
			attachment: {
				mimeType: "application/pdf",
				name: "contract.pdf",
				size: 3,
				type: "file",
			} satisfies Attachment,
			botToken: "xoxb-test",
			rawFiles: [
				{
					id: "F1",
					mimetype: "application/pdf",
					name: "contract.pdf",
					size: 3,
				},
			],
		});

		expect(data?.toString()).toBe("pdf");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain("file=F1");
	});
});
