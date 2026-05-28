import { createHash } from "node:crypto";
import { ms } from "@autumn/shared/unixUtils";
import { addMilliseconds, isPast } from "date-fns";
import { Redis } from "ioredis";
import type { AutumnMcpAuth } from "./auth.js";

export type BillingToolName = "attach" | "updateSubscription";

export type PendingBillingAction = {
	token: string;
	principalId: string;
	resource: string;
	env: string;
	toolName: BillingToolName;
	request: unknown;
	preview: string;
	createdAt: number;
	expiresAt: string;
};

const ttlMs = ms.minutes(15);
const namespace = "autumn:mcp:pending-action";
let redis: Redis | undefined;
type PendingActionRedis = {
	multi: () => {
		set: (
			key: string,
			value: string,
			expiryMode: "EX",
			ttlSeconds: number,
		) => PendingActionRedis["multi"] extends () => infer Multi ? Multi : never;
		exec: () => Promise<unknown>;
	};
	get: (key: string) => Promise<string | null>;
	del: (...keys: string[]) => Promise<unknown>;
	keys: (pattern: string) => Promise<string[]>;
};

const createToken = () => `act_${crypto.randomUUID().slice(0, 8)}`;
const isExpired = (action: PendingBillingAction) =>
	isPast(new Date(action.expiresAt));
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);
const shortHash = (value: string) => hash(value).slice(0, 8);
const redisUrl = () => process.env.REDIS_URL || "";

const actionScope = (auth: AutumnMcpAuth) =>
	hash([auth.principalId, auth.resource, auth.env].join(":"));
const latestKey = (auth: AutumnMcpAuth) =>
	`${namespace}:${actionScope(auth)}:latest`;
const actionKey = (token: string) => `${namespace}:action:${token}`;
const actionDebug = (auth: AutumnMcpAuth) => ({
	env: auth.env,
	principal: shortHash(auth.principalId),
	resource: shortHash(auth.resource),
	scope: actionScope(auth),
});
const logPendingAction = (event: string, data: Record<string, unknown>) => {
	if (process.env.MCP_DEBUG_PENDING_ACTIONS !== "1") return;
	console.log(`[mcp:pending-actions] ${event} ${JSON.stringify(data)}`);
};

export const setPendingActionsRedis = (client: PendingActionRedis) => {
	redis = client as unknown as Redis;
};

const getRedis = (): PendingActionRedis => {
	if (redis) return redis;
	const url = redisUrl().trim();
	if (!url) {
		throw new Error("REDIS_URL is required for MCP pending billing actions.");
	}

	redis = new Redis(url, {
		maxRetriesPerRequest: 1,
		commandTimeout: 5_000,
	});
	redis.on("error", () => undefined);
	logPendingAction("store", { backend: "redis", redisUrl: true });
	return redis;
};

const parseStoredAction = (value: string | null) =>
	(value ? (JSON.parse(value) as PendingBillingAction) : null);

const createAction = ({
	auth,
	toolName,
	request,
	preview,
}: {
	auth: AutumnMcpAuth;
	toolName: BillingToolName;
	request: unknown;
	preview: string;
}) =>
	({
		token: createToken(),
		principalId: auth.principalId,
		resource: auth.resource,
		env: auth.env,
		toolName,
		request,
		preview,
		createdAt: Date.now(),
		expiresAt: addMilliseconds(new Date(), ttlMs).toISOString(),
	}) satisfies PendingBillingAction;

export const createPendingAction = async (input: {
	auth: AutumnMcpAuth;
	toolName: BillingToolName;
	request: unknown;
	preview: string;
}) => {
	const action = createAction(input);
	const client = getRedis();
	const ttlSeconds = Math.ceil(ttlMs / 1000);
	await client
		.multi()
		.set(actionKey(action.token), JSON.stringify(action), "EX", ttlSeconds)
		.set(latestKey(input.auth), action.token, "EX", ttlSeconds)
		.exec();
	logPendingAction("created", {
		backend: "redis",
		toolName: action.toolName,
		token: shortHash(action.token),
		...actionDebug(input.auth),
	});
	return action;
};

export const claimLatestPendingAction = async (auth: AutumnMcpAuth) => {
	const client = getRedis();
	const token = await client.get(latestKey(auth));
	const action = token ? parseStoredAction(await client.get(actionKey(token))) : null;
	if (!token || !action || isExpired(action)) {
		logPendingAction("claim-miss", {
			backend: "redis",
			reason: !token ? "missing_latest" : !action ? "missing_action" : "expired",
			token: token ? shortHash(token) : null,
			...actionDebug(auth),
		});
		throw new Error("No pending billing action to confirm.");
	}
	await client.del(latestKey(auth), actionKey(token));
	logPendingAction("claimed", {
		backend: "redis",
		toolName: action.toolName,
		token: shortHash(token),
		...actionDebug(auth),
	});
	return action;
};

export const getLatestPendingAction = async (auth: AutumnMcpAuth) => {
	const client = getRedis();
	const token = await client.get(latestKey(auth));
	const action = token ? parseStoredAction(await client.get(actionKey(token))) : null;
	if (!action || isExpired(action)) return null;
	return action;
};

export const clearPendingActions = async () => {
	const client = getRedis();
	const keys = await client.keys(`${namespace}:*`);
	if (keys.length) await client.del(...keys);
};
