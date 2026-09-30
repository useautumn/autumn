import type { ErrorKind } from "./errorKind.js";

export type ErrorClassification = {
	kind: ErrorKind;
	code?: string;
};
