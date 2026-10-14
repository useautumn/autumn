import { createHash } from "node:crypto";
import { ms } from "@autumn/shared/unixUtils";

const sessionWindowMs = ms.minutes(30);

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

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
