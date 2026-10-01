import type { ErrorKind } from "../models/errorKind.js";

export type ReportPolicy = {
	logLevel: "warn" | "error";
	captureToSentry: boolean;
};

const reportPolicyByKind: Record<ErrorKind, ReportPolicy> = {
	expected: { logLevel: "warn", captureToSentry: false },
	infra: { logLevel: "error", captureToSentry: true },
	bug: { logLevel: "error", captureToSentry: true },
};

export const kindToReportPolicy = ({ kind }: { kind: ErrorKind }) =>
	reportPolicyByKind[kind];
