import { AsyncLocalStorage } from "node:async_hooks";

const trustedSsoOrigins = new AsyncLocalStorage<ReadonlySet<string>>();

export const withTrustedSsoOrigin = async <T>({
	origin,
	run,
}: {
	origin: string;
	run: () => Promise<T>;
}): Promise<T> => trustedSsoOrigins.run(new Set([origin]), run);

export const getTrustedSsoOrigins = (): string[] => [
	...(trustedSsoOrigins.getStore() ?? []),
];
