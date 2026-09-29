import type { AutumnLogger } from "@autumn/logging";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import type { Attachment } from "chat";
import { logger as rootLogger } from "../../../lib/logger.js";

const MAX_ATTACHMENTS = 4;
// Files from earlier in the thread ride along on top of the message's own.
const MAX_THREAD_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
	"application/pdf",
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

const INLINE_TEXT_MIME_TYPES = new Set([
	"application/javascript",
	"application/json",
	"application/sql",
	"application/toml",
	"application/typescript",
	"application/x-sh",
	"application/x-yaml",
	"application/xml",
]);
const MAX_INLINE_TEXT_BYTES = 48 * 1024;

const isInlineTextAttachment = (attachment: Attachment) =>
	Boolean(
		attachment.mimeType &&
			(attachment.mimeType.startsWith("text/") ||
				INLINE_TEXT_MIME_TYPES.has(attachment.mimeType)),
	);

const inlineTextBlock = ({ data, label }: { data: Buffer; label: string }) => {
	const truncated = data.byteLength > MAX_INLINE_TEXT_BYTES;
	const text = data
		.subarray(0, MAX_INLINE_TEXT_BYTES)
		.toString("utf8")
		.replace(/```/g, "ʼʼʼ");
	return `Attached file: ${label}${truncated ? " (truncated)" : ""}\n\`\`\`\n${text}\n\`\`\``;
};

type AttachmentFetchFallback = ({
	attachment,
}: {
	attachment: Attachment;
}) => Promise<Buffer | null>;

const getAttachmentLabel = (attachment: Attachment) =>
	attachment.name ?? attachment.mimeType ?? "unnamed attachment";

const isSupportedAttachment = (attachment: Attachment) =>
	attachment.mimeType ? SUPPORTED_MIME_TYPES.has(attachment.mimeType) : false;

const fetchAttachmentData = async ({
	attachment,
	fetchFallback,
}: {
	attachment: Attachment;
	fetchFallback?: AttachmentFetchFallback;
}) => {
	if (attachment.data) {
		return attachment.data instanceof Blob
			? Buffer.from(await attachment.data.arrayBuffer())
			: Buffer.from(attachment.data);
	}
	if (attachment.fetchData) return attachment.fetchData();
	return fetchFallback?.({ attachment }) ?? null;
};

type EarlierAttachment = Readonly<{ attachment: Attachment; author: string }>;

export const prepareAttachmentMessage = async ({
	attachments = [],
	fetchFallback,
	logger = rootLogger,
	text,
	threadAttachments = [],
}: {
	attachments?: ReadonlyArray<Attachment>;
	fetchFallback?: AttachmentFetchFallback;
	logger?: AutumnLogger;
	text: string;
	/** Files shared earlier in the thread, newest first. */
	threadAttachments?: ReadonlyArray<EarlierAttachment>;
}) => {
	const notes: string[] = [];
	const parts: Array<{
		data: Buffer;
		filename?: string;
		mediaType: string;
		type: "file";
	}> = [];

	const inlineBlocks: string[] = [];
	const earlierLabels: string[] = [];
	const selected = [
		...attachments
			.slice(0, MAX_ATTACHMENTS)
			.map((attachment) => ({ attachment, author: undefined })),
		...threadAttachments.slice(0, MAX_THREAD_ATTACHMENTS),
	];
	for (const { attachment, author } of selected) {
		const label = author
			? `${getAttachmentLabel(attachment)} (shared earlier in the thread by ${author})`
			: getAttachmentLabel(attachment);
		if (
			!(isSupportedAttachment(attachment) || isInlineTextAttachment(attachment))
		) {
			notes.push(`Skipped ${label}: unsupported file type.`);
			continue;
		}
		if (attachment.size && attachment.size > MAX_ATTACHMENT_BYTES) {
			notes.push(`Skipped ${label}: file is too large.`);
			continue;
		}

		try {
			const data = await fetchAttachmentData({ attachment, fetchFallback });
			if (!data) {
				notes.push(`Skipped ${label}: file could not be downloaded.`);
				continue;
			}
			if (data.byteLength > MAX_ATTACHMENT_BYTES) {
				notes.push(`Skipped ${label}: downloaded file is too large.`);
				continue;
			}
			if (author) earlierLabels.push(label);
			if (isInlineTextAttachment(attachment)) {
				inlineBlocks.push(inlineTextBlock({ data, label }));
				continue;
			}
			parts.push({
				type: "file",
				data,
				filename: attachment.name,
				mediaType: attachment.mimeType as string,
			});
		} catch (error) {
			logger.warn("Could not prepare Slack attachment", {
				event: "leaf.slack_attachment_prepare_failed",
				data: {
					name: attachment.name,
					mime_type: attachment.mimeType,
					size: attachment.size,
				},
				error,
			});
			notes.push(`Skipped ${label}: file could not be processed.`);
		}
	}

	if (attachments.length > MAX_ATTACHMENTS) {
		notes.push(
			`Skipped ${attachments.length - MAX_ATTACHMENTS} extra attachment(s).`,
		);
	}
	if (threadAttachments.length > MAX_THREAD_ATTACHMENTS) {
		notes.push(
			`Skipped ${threadAttachments.length - MAX_THREAD_ATTACHMENTS} older file(s) from earlier in the thread.`,
		);
	}

	const userText = [
		text.trim() || "Please answer using the attached Slack file(s).",
		earlierLabels.length
			? `Also attached, from earlier in this thread:\n${earlierLabels.map((label) => `- ${label}`).join("\n")}`
			: null,
		...inlineBlocks,
		notes.length ? `Attachment processing notes:\n${notes.join("\n")}` : null,
	]
		.filter((line): line is string => Boolean(line))
		.join("\n\n");
	const message = [
		{
			role: "user" as const,
			content: [...parts, { type: "text" as const, text: userText }],
		},
	] satisfies MessageListInput;

	return {
		attachmentCount: parts.length,
		envSelectionText: [
			text,
			selected.length
				? `Slack attachments: ${selected
						.map(({ attachment }) => getAttachmentLabel(attachment))
						.join(", ")}`
				: null,
			notes.length ? `Attachment notes: ${notes.join(" ")}` : null,
		]
			.filter((line): line is string => Boolean(line))
			.join("\n\n"),
		message,
		notes,
		parts,
		userText,
	};
};
