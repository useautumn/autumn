const DEFAULT_TEST_TIMEOUT_MS = 300_000;

export const getTestExecutionArgs = ({
	timeoutMs = DEFAULT_TEST_TIMEOUT_MS,
}: {
	timeoutMs?: number;
} = {}) => ["--timeout", String(timeoutMs)];
