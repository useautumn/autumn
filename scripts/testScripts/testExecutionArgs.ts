// Legacy meter tests intentionally spend over three minutes waiting for Stripe.
const DEFAULT_TEST_TIMEOUT_MS = 300_000;

export const getTestExecutionArgs = () => [
	"--timeout",
	String(DEFAULT_TEST_TIMEOUT_MS),
	"--bail=1",
];
