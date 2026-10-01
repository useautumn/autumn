import type { StackFrame } from "@sentry/bun";

/** Frames inside the logger itself; the caller of `logger.error` is the first frame past them. */
const PACKAGE_LOGGER_FRAME_PATHS = [
	"/node_modules/",
	"/packages/errors/",
	"/packages/logging/",
];

const isLoggerFrame = ({
	frame,
	loggerFramePaths,
}: {
	frame: StackFrame;
	loggerFramePaths: string[];
}) =>
	[...PACKAGE_LOGGER_FRAME_PATHS, ...loggerFramePaths].some((path) =>
		(frame.abs_path ?? frame.filename ?? "").includes(path),
	);

/** Sentry frames run oldest → newest, so the logger's own frames sit at the end. */
export const trimLoggerFrames = ({
	frames,
	loggerFramePaths,
}: {
	frames: StackFrame[];
	loggerFramePaths: string[];
}): StackFrame[] => {
	const trimmed = [...frames];
	while (
		trimmed.length > 1 &&
		isLoggerFrame({ frame: trimmed[trimmed.length - 1], loggerFramePaths })
	) {
		trimmed.pop();
	}
	return trimmed;
};
