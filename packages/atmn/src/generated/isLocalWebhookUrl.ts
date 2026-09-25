// Copied by @autumn/atmn-generator from shared/api/webhooks/endpoints/isLocalWebhookUrl.ts.
// Do not edit — change that file and run `bun generate` instead.

const PRIVATE_IPV4_RANGES: [base: number, prefixBits: number][] = [
	[0x00000000, 32], // 0.0.0.0
	[0x7f000000, 8], // 127.0.0.0/8
	[0x0a000000, 8], // 10.0.0.0/8
	[0xac100000, 12], // 172.16.0.0/12
	[0xc0a80000, 16], // 192.168.0.0/16
	[0xa9fe0000, 16], // 169.254.0.0/16
];

const parseIpv4 = (host: string): number | null => {
	const parts = host.split(".");
	if (parts.length !== 4) return null;
	if (parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) {
		return null;
	}
	return parts.reduce((acc, part) => acc * 256 + Number(part), 0);
};

const isPrivateIpv4 = (address: number) =>
	PRIVATE_IPV4_RANGES.some(([base, prefixBits]) => {
		const mask = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
		return (address & mask) >>> 0 === base;
	});

const isLocalIpv6 = (host: string) => {
	if (host === "::1" || host === "::") return true;
	if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
	// Unique-local fc00::/7, IPv6's private ranges
	if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true;
	// WHATWG URL rewrites ::ffff:127.0.0.1 to ::ffff:7f00:1
	const [, high, low] =
		host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/) ?? [];
	if (!high || !low) return false;
	return isPrivateIpv4(
		Number.parseInt(high, 16) * 0x10000 + Number.parseInt(low, 16),
	);
};

/** True when the URL literally points at this machine or a private network.
 * Svix delivers from the internet, so such an endpoint could never be reached. */
export const isLocalWebhookUrl = (url: string): boolean => {
	let hostname: string;
	try {
		hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return false;
	}

	if (hostname.startsWith("[") && hostname.endsWith("]")) {
		return isLocalIpv6(hostname.slice(1, -1));
	}
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local")
	) {
		return true;
	}
	const ipv4 = parseIpv4(hostname);
	return ipv4 !== null && isPrivateIpv4(ipv4);
};
