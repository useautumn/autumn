import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Tokens live in files (mode 600) outside the repo; values are never logged. */
const TOKEN_DIR =
	process.env.TURSO_TOKEN_DIR ?? `${process.env.HOME}/.capy/work/turso`;
const ORG = process.env.TURSO_ORG ?? "johnyeocx";
const REGION = process.env.TURSO_REGION ?? "aws-us-east-1";

export const dbUrl = ({ db }: { db: string }) =>
	`libsql://${db}-${ORG}.${REGION}.turso.io`;

export const dbToken = ({
	db,
	access,
}: {
	db: string;
	access: "full" | "read";
}) =>
	(access === "read" ? process.env.TURSO_READ_TOKEN : undefined) ??
	readFileSync(
		join(TOKEN_DIR, access === "full" ? `.tok-${db}` : `.rtok-${db}`),
		"utf8",
	).trim();

export const nowMs = () => performance.timeOrigin + performance.now();
