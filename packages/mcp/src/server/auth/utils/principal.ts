import { createHash } from "node:crypto";

/** Short, stable digest used to anonymise secrets inside principal ids. */
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * Builds a principal id from a secret without leaking it, e.g.
 * `secret-key:<digest>`.
 */
export const principalFromSecret = ({
	kind,
	value,
}: {
	kind: string;
	value: string;
}) => `${kind}:${hash(value)}`;
