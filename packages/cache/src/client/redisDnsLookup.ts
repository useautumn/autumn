import {
	lookup as defaultLookup,
	resolve4 as defaultResolve4,
	type LookupAddress,
	type LookupOptions,
} from "node:dns";
import type { LookupFunction } from "node:net";

type LookupHost = (
	hostname: string,
	options: LookupOptions,
	callback: (
		error: NodeJS.ErrnoException | null,
		address: string | LookupAddress[],
		family: number,
	) => void,
) => void;

type Resolve4Host = (
	hostname: string,
	callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void,
) => void;

export const createRedisDnsLookup = ({
	lookupHost = defaultLookup as LookupHost,
	resolve4Host = defaultResolve4,
}: {
	lookupHost?: LookupHost;
	resolve4Host?: Resolve4Host;
} = {}): LookupFunction => {
	return (hostname, options, callback) => {
		lookupHost(hostname, options, (lookupError, address, family) => {
			if (!lookupError) {
				callback(null, address, family);
				return;
			}

			if (lookupError.code !== "ENOTFOUND" || options.all) {
				callback(lookupError, "", family);
				return;
			}

			resolve4Host(hostname, (resolveError, addresses) => {
				const resolvedAddress = addresses?.[0];
				if (resolveError || !resolvedAddress) {
					callback(resolveError ?? lookupError, "", 4);
					return;
				}

				callback(null, resolvedAddress, 4);
			});
		});
	};
};

export const redisDnsLookup = createRedisDnsLookup();
