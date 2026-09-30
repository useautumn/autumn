import { describe, expect, test } from "bun:test";
import type { Attachment } from "chat";
import { prepareAttachmentMessage } from "../../../src/providers/slack/setup/prepareAttachments.js";

const getUserContent = async (
	params: Parameters<typeof prepareAttachmentMessage>[0],
) => {
	const prepared = await prepareAttachmentMessage(params);
	const [message] = prepared.message as Array<{
		content: Array<Record<string, unknown>>;
		role: string;
	}>;
	return { ...prepared, content: message.content };
};

describe("Slack attachment message preparation", () => {
	test("adds PDFs as file parts", async () => {
		const attachment = {
			data: Buffer.from("pdf"),
			mimeType: "application/pdf",
			name: "contract.pdf",
			size: 3,
			type: "file",
		} satisfies Attachment;

		const { attachmentCount, content, delivered } = await getUserContent({
			attachments: [attachment],
			text: "please provision this",
		});

		expect(attachmentCount).toBe(1);
		expect(delivered).toEqual([attachment]);
		expect(content[0]).toMatchObject({
			filename: "contract.pdf",
			mediaType: "application/pdf",
			type: "file",
		});
		expect(content[1]).toMatchObject({
			text: "please provision this",
			type: "text",
		});
	});

	test("adds images as file parts", async () => {
		const attachment = {
			fetchData: async () => Buffer.from("png"),
			mimeType: "image/png",
			name: "screenshot.png",
			size: 3,
			type: "image",
		} satisfies Attachment;

		const { attachmentCount, content } = await getUserContent({
			attachments: [attachment],
			text: "",
		});

		expect(attachmentCount).toBe(1);
		expect(content[0]).toMatchObject({
			filename: "screenshot.png",
			mediaType: "image/png",
			type: "file",
		});
		expect(content[1]).toMatchObject({
			text: "Please answer using the attached Slack file(s).",
			type: "text",
		});
	});

	test("uses fallback download when adapter fetchData is unavailable", async () => {
		const attachment = {
			mimeType: "application/pdf",
			name: "contract.pdf",
			size: 3,
			type: "file",
		} satisfies Attachment;

		const { attachmentCount } = await prepareAttachmentMessage({
			attachments: [attachment],
			fetchFallback: async ({ attachment: fallbackAttachment }) => {
				expect(fallbackAttachment.name).toBe("contract.pdf");
				return Buffer.from("pdf");
			},
			text: "read this",
		});

		expect(attachmentCount).toBe(1);
	});

	test("skips unsupported and oversized attachments with notes", async () => {
		const attachments = [
			{
				mimeType: "application/zip",
				name: "archive.zip",
				size: 1,
				type: "file",
			},
			{
				mimeType: "application/pdf",
				name: "huge.pdf",
				size: 21 * 1024 * 1024,
				type: "file",
			},
		] satisfies Attachment[];

		const { attachmentCount, delivered, notes } =
			await prepareAttachmentMessage({
				attachments,
				text: "read these",
			});

		expect(attachmentCount).toBe(0);
		expect(notes).toEqual([
			"Skipped archive.zip: unsupported file type.",
			"Skipped huge.pdf: file is too large.",
		]);
		expect(delivered).toEqual([]);
	});

	test("adds files from earlier in the thread after the message's own, naming who shared them", async () => {
		const own = {
			data: Buffer.from("png"),
			mimeType: "image/png",
			name: "own.png",
			type: "image",
		} satisfies Attachment;
		const contract = {
			fetchData: async () => Buffer.from("pdf"),
			mimeType: "application/pdf",
			name: "contract.pdf",
			type: "file",
		} satisfies Attachment;

		const { attachmentCount, content } = await getUserContent({
			attachments: [own],
			text: "@Autumn do the above",
			threadAttachments: [{ attachment: contract, author: "Bill" }],
		});

		expect(attachmentCount).toBe(2);
		expect(content.map((part) => part.filename)).toEqual([
			"own.png",
			"contract.pdf",
			undefined,
		]);
		expect(content[2]?.text).toContain(
			"contract.pdf (shared earlier in the thread by Bill)",
		);
	});

	test("caps files from earlier in the thread and says how many were left out", async () => {
		const earlier = Array.from({ length: 6 }, (_, index) => ({
			attachment: {
				data: Buffer.from("pdf"),
				mimeType: "application/pdf",
				name: `file-${index}.pdf`,
				type: "file",
			} satisfies Attachment,
			author: "Bill",
		}));

		const { attachmentCount, notes } = await getUserContent({
			text: "@Autumn go",
			threadAttachments: earlier,
		});

		expect(attachmentCount).toBe(4);
		expect(notes).toContain(
			"Skipped 2 older file(s) from earlier in the thread.",
		);
	});
});
