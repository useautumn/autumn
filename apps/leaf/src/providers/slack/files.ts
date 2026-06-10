import type { Attachment } from "chat";

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

const fetchSlackFileInfoUrl = async ({
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
	if (!isRecord(data) || data.ok !== true || !isRecord(data.file)) return null;
	return typeof data.file.url_private === "string"
		? data.file.url_private
		: null;
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
			? await fetchSlackFileInfoUrl({ botToken, fileId: rawFile.id })
			: null);
	if (!url) return null;
	return fetchSlackPrivateUrl({ botToken, url });
};
