import { prefixCustomerJwt, stripCustomerJwtPrefix } from "@autumn/auth";
import { jwtVerify, SignJWT } from "jose";

/**
 * Per-customer JWTs: scoped credentials so self-hosted / licensed apps call
 * Autumn directly without shipping an `am_sk` key. Identity only — never
 * balances or plan state. Signed + verified with one server-side secret.
 */
const ALG = "HS256";
export const AUD_ACCESS = "autumn-api";
export const AUD_REFRESH = "autumn-refresh";
// Stable issuer so we can move to per-org keys / a published JWKS later without
// re-minting; `iss` is validated on every verify.
const ISSUER = "https://iss.useautumn.com";
const ACCESS_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TTL_SECONDS = 24 * 60 * 60; // 24h
const MIN_SECRET_LENGTH = 32;
// Token schema version. Stamped on every mint and read back on verify so future
// changes (new claims, key rotation, Redis-hash semantics) can be gated by `v` —
// existing tokens keep verifying under their own version until they expire,
// instead of forcing a mass revoke.
const SCHEMA_VERSION = 1;

/** Thrown when CUSTOMER_JWT_SECRET is missing/weak — a server misconfiguration,
 *  not a bad token. Callers surface this as 500, never as a 401 auth failure. */
export class CustomerJwtConfigError extends Error {}

const getSecret = () => {
	const secret = process.env.CUSTOMER_JWT_SECRET;
	if (!secret) {
		throw new CustomerJwtConfigError("CUSTOMER_JWT_SECRET is not set");
	}
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new CustomerJwtConfigError(
			`CUSTOMER_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
		);
	}
	return new TextEncoder().encode(secret);
};

export type CustomerJwtClaims = {
	version: number;
	customerId: string;
	orgId: string;
	env: string;
	scopes: string[];
	epoch: number;
	refreshKid: number;
	aud: string;
};

type SignArgs = {
	customerId: string;
	orgId: string;
	env: string;
	scopes: string[];
	epoch: number;
	refreshKid: number;
	aud: string;
	ttlSeconds: number;
	nowSeconds: number;
};

const sign = async (args: SignArgs) => {
	const token = await new SignJWT({
		v: SCHEMA_VERSION,
		orgId: args.orgId,
		env: args.env,
		scopes: args.scopes,
		epoch: args.epoch,
		refresh_kid: args.refreshKid,
	})
		.setProtectedHeader({ alg: ALG })
		.setIssuer(ISSUER)
		.setSubject(args.customerId)
		.setAudience(args.aud)
		.setIssuedAt(args.nowSeconds)
		.setExpirationTime(args.nowSeconds + args.ttlSeconds)
		.sign(getSecret());

	return prefixCustomerJwt({ token });
};

export const mintTokenPair = async ({
	customerId,
	orgId,
	env,
	scopes,
	epoch,
	refreshKid,
}: {
	customerId: string;
	orgId: string;
	env: string;
	scopes: string[];
	epoch: number;
	refreshKid: number;
}) => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const base = {
		customerId,
		orgId,
		env,
		scopes,
		epoch,
		refreshKid,
		nowSeconds,
	};

	const accessToken = await sign({
		...base,
		aud: AUD_ACCESS,
		ttlSeconds: ACCESS_TTL_SECONDS,
	});
	const refreshToken = await sign({
		...base,
		aud: AUD_REFRESH,
		ttlSeconds: REFRESH_TTL_SECONDS,
	});

	return {
		accessToken,
		refreshToken,
		expiresAt: (nowSeconds + ACCESS_TTL_SECONDS) * 1000,
		refreshExpiresAt: (nowSeconds + REFRESH_TTL_SECONDS) * 1000,
	};
};

export const verifyCustomerJwt = async ({
	token,
}: {
	token: string;
}): Promise<CustomerJwtClaims> => {
	const { payload } = await jwtVerify(
		stripCustomerJwtPrefix({ token }),
		getSecret(),
		{ algorithms: [ALG], issuer: ISSUER },
	);

	const aud = payload.aud as string;
	if (aud !== AUD_ACCESS && aud !== AUD_REFRESH) {
		throw new Error("Invalid customer token audience");
	}

	return {
		// Absent ⇒ a pre-versioning token ⇒ treat as v1.
		version: typeof payload.v === "number" ? payload.v : 1,
		customerId: payload.sub as string,
		orgId: payload.orgId as string,
		env: payload.env as string,
		scopes: (payload.scopes as string[] | undefined) ?? [],
		epoch: typeof payload.epoch === "number" ? payload.epoch : 0,
		refreshKid:
			typeof payload.refresh_kid === "number" ? payload.refresh_kid : 0,
		aud,
	};
};
