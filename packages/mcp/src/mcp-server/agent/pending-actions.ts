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
	expiresAt: number;
};

const ttlMs = 15 * 60 * 1000;
const pending = new Map<string, PendingBillingAction>();
let sequence = 0;

const createToken = () => `act_${crypto.randomUUID().slice(0, 8)}`;

const isExpired = (action: PendingBillingAction) => action.expiresAt <= Date.now();

const matchesAuth = (action: PendingBillingAction, auth: AutumnMcpAuth) =>
	action.principalId === auth.principalId &&
	action.resource === auth.resource &&
	action.env === auth.env;

const getLatestPendingAction = (auth: AutumnMcpAuth) => {
	let latest: PendingBillingAction | null = null;
	for (const action of pending.values()) {
		if (isExpired(action)) {
			pending.delete(action.token);
			continue;
		}
		if (!matchesAuth(action, auth)) continue;
		if (!latest || action.createdAt > latest.createdAt) latest = action;
	}
	return latest;
};

export const createPendingAction = ({
	auth,
	toolName,
	request,
	preview,
}: {
	auth: AutumnMcpAuth;
	toolName: BillingToolName;
	request: unknown;
	preview: string;
}) => {
	const action = {
		token: createToken(),
		principalId: auth.principalId,
		resource: auth.resource,
		env: auth.env,
		toolName,
		request,
		preview,
		createdAt: ++sequence,
		expiresAt: Date.now() + ttlMs,
	} satisfies PendingBillingAction;
	pending.set(action.token, action);
	return action;
};

export const claimPendingAction = (auth: AutumnMcpAuth, token: string) => {
	const action = pending.get(token);
	if (!action || isExpired(action)) {
		pending.delete(token);
		throw new Error("Confirmation token is invalid or expired.");
	}
	if (!matchesAuth(action, auth)) {
		throw new Error("Confirmation token does not belong to this session.");
	}
	pending.delete(token);
	return action;
};

export const claimLatestPendingAction = (auth: AutumnMcpAuth) => {
	const action = getLatestPendingAction(auth);
	if (!action) throw new Error("No pending billing action to confirm.");
	pending.delete(action.token);
	return action;
};

export const cancelPendingAction = (auth: AutumnMcpAuth, token: string) => {
	const action = pending.get(token);
	if (!action || isExpired(action)) {
		pending.delete(token);
		throw new Error("Confirmation token is invalid or expired.");
	}
	if (!matchesAuth(action, auth)) {
		throw new Error("Confirmation token does not belong to this session.");
	}
	pending.delete(token);
};

export const cancelLatestPendingAction = (auth: AutumnMcpAuth) => {
	const action = getLatestPendingAction(auth);
	if (!action) throw new Error("No pending billing action to cancel.");
	pending.delete(action.token);
};

export const clearPendingActions = () => {
	pending.clear();
	sequence = 0;
};
