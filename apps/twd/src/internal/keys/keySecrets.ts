import { createHash } from "node:crypto";

/** platformAccountId → secret, filled by syncKeysFromEnv. Secrets never touch the DB. */
const secretsByPlatformAccount = new Map<string, string>();

export const hashKey = ({ secret }: { secret: string }): string =>
	createHash("sha256").update(secret).digest("hex");

export const keyHint = ({ secret }: { secret: string }): string =>
	`${secret.slice(0, secret.startsWith("sk_test_") ? 8 : 3)}…${secret.slice(-4)}`;

export const rememberKeySecret = ({
	platformAccountId,
	secret,
}: {
	platformAccountId: string;
	secret: string;
}): void => {
	secretsByPlatformAccount.set(platformAccountId, secret);
};

export const forgetKeySecretsExcept = ({
	platformAccountIds,
}: {
	platformAccountIds: Set<string>;
}): void => {
	for (const id of secretsByPlatformAccount.keys()) {
		if (!platformAccountIds.has(id)) secretsByPlatformAccount.delete(id);
	}
};

export const peekKeySecret = ({
	platformAccountId,
}: {
	platformAccountId: string;
}): string | undefined => secretsByPlatformAccount.get(platformAccountId);

export const knownKeySecrets = (): {
	platformAccountId: string;
	secret: string;
}[] =>
	[...secretsByPlatformAccount].map(([platformAccountId, secret]) => ({
		platformAccountId,
		secret,
	}));
