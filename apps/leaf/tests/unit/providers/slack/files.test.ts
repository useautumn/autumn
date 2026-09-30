import { afterEach, describe, expect, test } from "bun:test";
import type { Attachment } from "chat";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
	hydrateSlackAttachment,
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

	test("fills in a Slack Connect file stub from files.info", async () => {
		const requested: string[] = [];
		globalThis.fetch = (async (url) => {
			requested.push(String(url));
			if (String(url).startsWith("https://slack.com/api/files.info")) {
				return Response.json({
					ok: true,
					file: {
						id: "F2",
						mimetype: "application/pdf",
						name: "order-form.pdf",
						size: 3,
						url_private: "https://files.slack.com/order-form.pdf",
					},
				});
			}
			return new Response("pdf");
		}) as typeof fetch;

		const hydrated = await hydrateSlackAttachment({
			attachment: { type: "file" } satisfies Attachment,
			botToken: "xoxb-test",
			fileIndex: 1,
			raw: {
				files: [
					{ id: "F1", mimetype: "image/png", name: "logo.png" },
					{ id: "F2", file_access: "check_file_info" },
				],
			},
		});

		expect(hydrated).toMatchObject({
			mimeType: "application/pdf",
			name: "order-form.pdf",
			size: 3,
		});
		expect(requested[0]).toBe("https://slack.com/api/files.info?file=F2");
		expect((await hydrated.fetchData?.())?.toString()).toBe("pdf");
	});

	test("leaves attachments that already have metadata alone", async () => {
		globalThis.fetch = (async () => {
			throw new Error("should not fetch");
		}) as unknown as typeof fetch;
		const attachment = {
			mimeType: "application/pdf",
			name: "contract.pdf",
			type: "file",
		} satisfies Attachment;

		expect(
			await hydrateSlackAttachment({
				attachment,
				botToken: "xoxb-test",
				fileIndex: 0,
				raw: { files: [{ id: "F1" }] },
			}),
		).toBe(attachment);
	});

	test("a rejected files.info lookup throws so the caller can log it", async () => {
		globalThis.fetch = (async () =>
			Response.json({
				ok: false,
				error: "file_not_found",
			})) as unknown as typeof fetch;

		await expect(
			hydrateSlackAttachment({
				attachment: { type: "file" } satisfies Attachment,
				botToken: "xoxb-test",
				fileIndex: 0,
				raw: { files: [{ id: "F1" }] },
			}),
		).rejects.toThrow("file_not_found");
	});
});
