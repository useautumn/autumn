import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Tokens live in files (mode 600) outside the repo; values are never logged. */
const TOKEN_DIR =
	process.env.TURSO_TOKEN_DIR ?? `${process.env.HOME}/.capy/work/turso`;
const ORG = process.env.TURSO_ORG ?? "johnyeocx";
const REGION = process.env.TURSO_REGION ?? "aws-us-east-1";

/** SPIKE_URL points the probe at a self-hosted sqld instead of Turso Cloud (no auth). */
export const dbUrl = ({ db }: { db: string }) =>
	process.env.SPIKE_URL ?? `libsql://${db}-${ORG}.${REGION}.turso.io`;

export const dbToken = ({
	db,
	access,
}: {
	db: string;
	access: "full" | "read";
}) =>
	process.env.SPIKE_URL
		? ""
		: readFileSync(
				join(TOKEN_DIR, access === "full" ? `.tok-${db}` : `.rtok-${db}`),
				"utf8",
			).trim();

export const nowMs = () => performance.timeOrigin + performance.now();
