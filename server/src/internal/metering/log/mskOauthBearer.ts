import { fromContainerMetadata } from "@aws-sdk/credential-providers";
import {
	generateAuthToken,
	generateAuthTokenFromCredentialsProvider,
} from "aws-msk-iam-sasl-signer-js";

/** ECS/Fargate publishes exactly one of these; the SDK's container provider
 *  reads whichever is set. Their absence is the only reliable signal that we
 *  are not running under a task role. */
const CONTAINER_CREDENTIAL_ENV_VARS = [
	"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
	"AWS_CONTAINER_CREDENTIALS_FULL_URI",
] as const;

export type OauthBearerToken = { value: string };

export const hasContainerCredentials = ({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): boolean =>
	CONTAINER_CREDENTIAL_ENV_VARS.some((name) => Boolean(env[name]?.trim()));

/**
 * Builds the kafkajs `oauthBearerProvider` used for MSK IAM auth.
 *
 * In a task definition the container credential endpoint is the only source
 * that can sign an MSK token, so we name it explicitly instead of letting the
 * default chain pick: the chain also walks env keys, the shared profile, SSO
 * and IMDS, and a stale entry earlier in that order signs a token the broker
 * rejects with an opaque SASL failure. Pinning the provider turns that class
 * of failure into a plain "no container credentials" error at the right layer.
 *
 * Local dev has no container endpoint, so it keeps the default chain
 * (`generateAuthToken`) and behaves exactly as before.
 */
export const createMskOauthBearerProvider = ({
	region,
	env = process.env,
}: {
	region: string;
	env?: Record<string, string | undefined>;
}): (() => Promise<OauthBearerToken>) => {
	if (!hasContainerCredentials({ env })) {
		return async () => {
			const { token } = await generateAuthToken({ region });
			return { value: token };
		};
	}

	// Built once per client, not per token: the provider memoises the container
	// endpoint's response and refreshes on expiry by itself.
	const awsCredentialsProvider = fromContainerMetadata();

	return async () => {
		const { token } = await generateAuthTokenFromCredentialsProvider({
			region,
			awsCredentialsProvider,
		});
		return { value: token };
	};
};
