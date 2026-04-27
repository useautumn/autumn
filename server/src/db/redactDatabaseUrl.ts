import { createHash } from "node:crypto";

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 12);

const mask = (value: string) =>
	value.length <= 2 ? "***" : `${value[0]}***${value[value.length - 1]}`;

const auth = (url: URL) => {
	const username = decodeURIComponent(url.username);
	const password = decodeURIComponent(url.password);
	if (!username && !password) return "";

	return `${username ? mask(username) : ""}${password ? `:${mask(password)}` : ""}@`;
};

const formatUrl = (value: string) => {
	const url = new URL(value);
	return `${url.protocol}//${auth(url)}${url.host}${url.pathname}${
		url.search ? "?<redacted>" : ""
	}`;
};

export const redactDatabaseUrl = (databaseUrl?: string) => {
	const value = databaseUrl?.trim();
	if (!value) return "unset";

	try {
		return `${formatUrl(value)} #${hash(value)}`;
	} catch {
		return `<invalid database url> #${hash(value)}`;
	}
};

export const getRedactedDatabaseUrls = () => ({
	primary: redactDatabaseUrl(process.env.DATABASE_V2_URL),
	replica: redactDatabaseUrl(process.env.DATABASE_V2_REPLICA_URL),
	critical: redactDatabaseUrl(
		process.env.DATABASE_V2_CRITICAL_URL || process.env.DATABASE_V2_URL,
	),
});
