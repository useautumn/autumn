import type { Attachment } from "chat";
import { threadAttachmentFileId } from "./threadContext.js";

const SLACK_FILES_INFO_URL = "https://slack.com/api/files.info";

type SlackRawFile = {
	id?: string;
	mimetype?: string;
	name?: string;
	size?: number;
	url_private?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const parseSlackFile = (value: unknown): SlackRawFile | null => {
	if (!isRecord(value)) return null;
	return {
		id: typeof value.id === "string" ? value.id : undefined,
		mimetype: typeof value.mimetype === "string" ? value.mimetype : undefined,
		name: typeof value.name === "string" ? value.name : undefined,
		size: typeof value.size === "number" ? value.size : undefined,
		url_private:
			typeof value.url_private === "string" ? value.url_private : undefined,
	};
};

export const getSlackFilesFromRaw = ({ raw }: { raw: unknown }) => {
	if (!isRecord(raw) || !Array.isArray(raw.files)) return [];
	return raw.files.flatMap((file) => {
		const parsed = parseSlackFile(file);
		return parsed ? [parsed] : [];
	});
};

const findRawFileForAttachment = ({
	attachment,
	files,
}: {
	attachment: Attachment;
	files: SlackRawFile[];
}) =>
	files.find(
		(file) =>
			file.name === attachment.name &&
			file.mimetype === attachment.mimeType &&
			file.size === attachment.size,
	) ?? files.find((file) => file.name === attachment.name);

const fetchSlackPrivateUrl = async ({
	botToken,
	url,
}: {
	botToken: string;
	url: string;
}) => {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${botToken}` },
	});
	if (!response.ok) {
		throw new Error(`Slack file download failed: ${response.status}`);
	}
	return Buffer.from(await response.arrayBuffer());
};

const fetchSlackFileInfo = async ({
	botToken,
	fileId,
}: {
	botToken: string;
	fileId: string;
}) => {
	const url = new URL(SLACK_FILES_INFO_URL);
	url.searchParams.set("file", fileId);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${botToken}` },
	});
	if (!response.ok)
		throw new Error(`Slack files.info failed: ${response.status}`);
	const data = await response.json();
	// A rejected lookup (e.g. no access to a shared-channel file) throws, so
	// callers log why the file could not be read.
	if (!isRecord(data) || data.ok !== true) {
		const reason =
			isRecord(data) && typeof data.error === "string" ? data.error : "unknown";
		throw new Error(`Slack files.info failed: ${reason}`);
	}
	return parseSlackFile(data.file);
};

/** Slack Connect (shared channel) events carry file stubs with only an id, so
 * the adapter builds attachments with no name, type or URL. Fill those in from
 * files.info; the adapter maps `files` to attachments in order. */
export const hydrateSlackAttachment = async ({
	attachment,
	botToken,
	fileIndex,
	raw,
}: {
	attachment: Attachment;
	botToken: string;
	fileIndex: number;
	raw: unknown;
}): Promise<Attachment> => {
	if (attachment.mimeType && attachment.name) return attachment;
	const fileId = threadAttachmentFileId({ fileIndex, raw });
	if (!fileId) return attachment;
	const file = await fetchSlackFileInfo({ botToken, fileId });
	if (!file) return attachment;
	const url = attachment.url ?? file.url_private;
	return {
		...attachment,
		mimeType: attachment.mimeType ?? file.mimetype,
		name: attachment.name ?? file.name,
		size: attachment.size ?? file.size,
		url,
		fetchData:
			attachment.fetchData ??
			(url ? () => fetchSlackPrivateUrl({ botToken, url }) : undefined),
	};
};

export const fetchSlackAttachmentFallback = async ({
	attachment,
	botToken,
	rawFiles,
}: {
	attachment: Attachment;
	botToken: string;
	rawFiles: SlackRawFile[];
}) => {
	const rawFile = findRawFileForAttachment({ attachment, files: rawFiles });
	if (!rawFile) return null;
	const url =
		rawFile.url_private ??
		(rawFile.id
			? (await fetchSlackFileInfo({ botToken, fileId: rawFile.id }))
					?.url_private
			: null);
	if (!url) return null;
	return fetchSlackPrivateUrl({ botToken, url });
};
