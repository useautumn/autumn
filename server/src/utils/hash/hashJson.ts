import { createHash } from "node:crypto";
import { deterministicStringify } from "@autumn/shared";

export const hashJson = ({ value }: { value: unknown }): string => {
	return createHash("sha256")
		.update(deterministicStringify(value))
		.digest("hex");
};
