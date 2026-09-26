import { expect, test } from "bun:test";
import { AuthType } from "@autumn/shared";
import {
	buildCheckoutSessionParams,
	getDefaultCheckoutSessionLifetimeSeconds,
} from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildCheckoutSessionParams";

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

const nowSeconds = () => Math.floor(Date.now() / 1000);

test("dashboard checkout sessions default to 24h, API sessions to 1h", () => {
	expect(
		getDefaultCheckoutSessionLifetimeSeconds({ authType: AuthType.Dashboard }),
	).toBe(ONE_DAY_SECONDS);
	expect(
		getDefaultCheckoutSessionLifetimeSeconds({ authType: AuthType.SecretKey }),
	).toBe(ONE_HOUR_SECONDS);
	expect(getDefaultCheckoutSessionLifetimeSeconds({})).toBe(ONE_HOUR_SECONDS);
});

test("buildCheckoutSessionParams applies the default lifetime when none is passed", () => {
	const before = nowSeconds();
	const params = buildCheckoutSessionParams({
		params: { mode: "subscription" },
		defaultSessionLifetimeSeconds: ONE_DAY_SECONDS,
	});
	const after = nowSeconds();

	expect(params.expires_at).toBeGreaterThanOrEqual(before + ONE_DAY_SECONDS);
	expect(params.expires_at).toBeLessThanOrEqual(after + ONE_DAY_SECONDS);
});

test("buildCheckoutSessionParams keeps a caller-provided expires_at", () => {
	const expiresAt = nowSeconds() + 2 * ONE_HOUR_SECONDS;
	const params = buildCheckoutSessionParams({
		params: { mode: "subscription" },
		checkoutSessionParams: { expires_at: expiresAt },
		defaultSessionLifetimeSeconds: ONE_DAY_SECONDS,
	});

	expect(params.expires_at).toBe(expiresAt);
});
