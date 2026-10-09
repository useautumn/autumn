import type { ApiByocCache, ByocCacheNetwork } from "@autumn/shared";
import {
	GlobeSimpleIcon,
	type Icon,
	LockSimpleIcon,
} from "@phosphor-icons/react";

type AtomNetworkDisplay = { label: string; hint: string; Icon: Icon };

export const ATOM_NETWORKS: Record<
	ByocCacheNetwork["type"],
	AtomNetworkDisplay
> = {
	existing_vpc: {
		label: "Private",
		hint: "Your app reaches Atom privately from inside your VPC.",
		Icon: LockSimpleIcon,
	},
	new_vpc: {
		label: "Public",
		hint: "Your app reaches Atom over the internet with its URL and your secret key.",
		Icon: GlobeSimpleIcon,
	},
};

/** An Atom set up without a network gets a new VPC. */
export const atomNetwork = (cache: ApiByocCache) =>
	ATOM_NETWORKS[cache.network?.type ?? "new_vpc"];
