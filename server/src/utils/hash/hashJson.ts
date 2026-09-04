import { createHash } from "node:crypto";
import { deterministicStringify } from "@autumn/shared";

/** Produce a SHA-256 hex digest from any JSON-serialisable value, key-order independent. */
export const hashJson = ({ value }: { value: unknown }): string => {
	return createHash("sha256")
		.update(deterministicStringify(value))
		.digest("hex");
};
