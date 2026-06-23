import { prefixCustomerJwt, stripCustomerJwtPrefix } from "@autumn/auth";
import { jwtVerify, SignJWT } from "jose";

/**
 * Per-customer JWTs: scoped credentials so self-hosted / licensed apps call
 * Autumn directly without an `am_sk` key. Identity only — never balances/plan
 * state. Flat, short claims keep the token small in the Authorization header.
 */
const ALG = "HS256";
export const AUD_ACCESS = "autumn-api";
export const AUD_REFRESH = "autumn-refresh";
const ISSUER = "https://iss.useautumn.com";
const ACCESS_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TTL_SECONDS = 24 * 60 * 60; // 24h
const MIN_SECRET_LENGTH = 32;
const SCHEMA_VERSION = 1;

/** Missing/weak secret = server misconfig (→ 500), not a bad token (→ 401). */
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
	customerId: string; // sub — external id, force-set onto the body
	internalCustomerId: string; // fam — immutable family + cache key
	env: string;
	epoch: number;
	refreshKid: number;
	aud: string;
};

type SignArgs = {
	customerId: string;
	internalCustomerId: string;
	env: string;
	epoch: number;
	refreshKid: number;
	aud: string;
	nowSeconds: number;
	ttlSeconds: number | null; // null ⇒ no `exp` (indefinite token)
};

const sign = async (args: SignArgs) => {
	const builder = new SignJWT({
		ver: SCHEMA_VERSION,
		fam: args.internalCustomerId,
		env: args.env,
		epo: args.epoch,
		gen: args.refreshKid,
	})
		.setProtectedHeader({ alg: ALG })
		.setIssuer(ISSUER)
		.setSubject(args.customerId)
		.setAudience(args.aud)
		.setIssuedAt(args.nowSeconds);

	if (args.ttlSeconds !== null) {
		builder.setExpirationTime(args.nowSeconds + args.ttlSeconds);
	}

	return prefixCustomerJwt({ token: await builder.sign(getSecret()) });
};

export const mintTokenPair = async ({
	customerId,
	internalCustomerId,
	env,
	epoch,
	refreshKid,
	indefinite = false,
}: {
	customerId: string;
	internalCustomerId: string;
	env: string;
	epoch: number;
	refreshKid: number;
	indefinite?: boolean;
}) => {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const base = {
		customerId,
		internalCustomerId,
		env,
		epoch,
		refreshKid,
		nowSeconds,
	};

	const accessToken = await sign({
		...base,
		aud: AUD_ACCESS,
		ttlSeconds: indefinite ? null : ACCESS_TTL_SECONDS,
	});

	// Indefinite tokens never expire and have no refresh — revoke is the only kill
	// switch (which is why this mode requires the durable DB family record).
	if (indefinite) {
		return {
			accessToken,
			refreshToken: undefined,
			expiresAt: null,
			refreshExpiresAt: undefined,
		};
	}

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
		{ algorithms: [ALG], issuer: ISSUER, audience: [AUD_ACCESS, AUD_REFRESH] },
	);

	const aud = payload.aud as string;
	if (aud !== AUD_ACCESS && aud !== AUD_REFRESH) {
		throw new Error("Invalid customer token audience");
	}

	return {
		version: typeof payload.ver === "number" ? payload.ver : 1,
		customerId: payload.sub as string,
		internalCustomerId: payload.fam as string,
		env: payload.env as string,
		epoch: typeof payload.epo === "number" ? payload.epo : 0,
		refreshKid: typeof payload.gen === "number" ? payload.gen : 0,
		aud,
	};
};
