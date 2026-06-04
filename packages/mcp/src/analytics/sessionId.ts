import { createHash } from "node:crypto";
import { ms } from "@autumn/shared/unixUtils";

const sessionWindowMs = ms.minutes(30);

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * Fallback session grouping. Stateful MCP clients send Mcp-Session-Id; when it
 * is absent, synthesize a coarse principal/client bucket so calls from the same
 * client within the window still collapse into one session.
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
