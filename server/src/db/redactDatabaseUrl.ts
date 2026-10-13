import { createHash } from "node:crypto";
import { createDatabaseEnv } from "@autumn/env/database";

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

export const getRedactedDatabaseUrls = () => {
	const databaseEnv = createDatabaseEnv(process.env);
	return {
		primary: redactDatabaseUrl(databaseEnv.DATABASE_URL),
		replica: redactDatabaseUrl(databaseEnv.DATABASE_REPLICA_URL),
		critical: redactDatabaseUrl(
			databaseEnv.DATABASE_CRITICAL_URL || databaseEnv.DATABASE_URL,
		),
	};
};
