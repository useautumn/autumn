import { createHash } from "node:crypto";
import { ms } from "@autumn/shared/unixUtils";

const sessionWindowMs = ms.minutes(30);

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * Stateless session grouping. The serverless MCP transport issues no
 * Mcp-Session-Id, so we synthesize one from the principal + client + a coarse
 * time bucket — calls from the same client within the window collapse into one
 * session.
 */
export const deriveSessionId = ({
	principalId,
	client,
	now,
}: {
	principalId: string;
	client: string | undefined;
	now: number;
}) =>
	hash(`${principalId}|${client ?? ""}|${Math.floor(now / sessionWindowMs)}`);
