import { createHash } from "node:crypto";

export const PUBLIC_DEV_ZONE = "autumnworktree.com";
export const KEEP_ALIVE_CONNECTIONS = 100;

export const PUBLIC_DEV_SERVICES = [
	"vite",
	"api",
	"checkout",
	"leaf",
	"emulate",
] as const;

export type PublicDevService = (typeof PUBLIC_DEV_SERVICES)[number];

export type PublicServiceUrls = Record<PublicDevService, string>;

export type PublicTunnelIngress = {
	hostname: string;
	origin: string;
};

function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

export function publicHostSlug({
	machineId,
	path,
	worktreeNum,
}: {
	machineId: string;
	path: string;
	worktreeNum: number;
}): string {
	return `autumn-wt${worktreeNum}-${shortHash(`${machineId}:${path}`)}`;
}

export function publicServiceHostname({
	service,
	slug,
}: {
	service: PublicDevService;
	slug: string;
}): string {
	const label = service === "vite" ? slug : `${slug}-${service}`;
	return `${label}.${PUBLIC_DEV_ZONE}`;
}

export function publicHostname({
	machineId,
	path,
	worktreeNum,
}: {
	machineId: string;
	path: string;
	worktreeNum: number;
}): string {
	return publicServiceHostname({
		service: "vite",
		slug: publicHostSlug({ machineId, path, worktreeNum }),
	});
}

export function publicTunnelName({
	machineId,
	path,
	worktreeNum,
}: {
	machineId: string;
	path: string;
	worktreeNum: number;
}): string {
	return publicHostSlug({ machineId, path, worktreeNum });
}

export function publicServiceUrls({ slug }: { slug: string }): PublicServiceUrls {
	return {
		api: `https://${publicServiceHostname({ slug, service: "api" })}`,
		checkout: `https://${publicServiceHostname({ slug, service: "checkout" })}`,
		emulate: `https://${publicServiceHostname({ slug, service: "emulate" })}`,
		leaf: `https://${publicServiceHostname({ slug, service: "leaf" })}`,
		vite: `https://${publicServiceHostname({ slug, service: "vite" })}`,
	};
}

export function dashboardSlug({
	hostname,
}: {
	hostname: string;
}): string | undefined {
	const suffix = `.${PUBLIC_DEV_ZONE}`;
	if (!hostname.endsWith(suffix)) return undefined;
	let slug = hostname.slice(0, -suffix.length);
	for (const service of PUBLIC_DEV_SERVICES) {
		if (service === "vite") continue;
		const tail = `-${service}`;
		if (slug.endsWith(tail)) {
			slug = slug.slice(0, -tail.length);
			break;
		}
	}
	return slug;
}

export function publicServiceUrlsFromDashboard({
	dashboard,
}: {
	dashboard: string;
}): PublicServiceUrls {
	const base = dashboard.replace(/\/$/, "");
	try {
		const slug = dashboardSlug({ hostname: new URL(base).hostname });
		if (slug) return publicServiceUrls({ slug });
	} catch {}
	return {
		api: base,
		checkout: base,
		emulate: base,
		leaf: base,
		vite: base,
	};
}

export function publicTunnelIngress({
	ports,
	slug,
}: {
	ports: Record<PublicDevService, number>;
	slug: string;
}): PublicTunnelIngress[] {
	return PUBLIC_DEV_SERVICES.map((service) => ({
		hostname: publicServiceHostname({ slug, service }),
		origin: `http://127.0.0.1:${ports[service]}`,
	}));
}

export function renderTunnelConfig({
	credentialsFile,
	ingress,
	tunnelId,
}: {
	credentialsFile: string;
	ingress: PublicTunnelIngress[];
	tunnelId: string;
}): string {
	const rules = ingress
		.map(
			(row) => `  - hostname: ${row.hostname}
    service: ${row.origin}
    originRequest:
      keepAliveConnections: ${KEEP_ALIVE_CONNECTIONS}`,
		)
		.join("\n");
	return `tunnel: ${tunnelId}
credentials-file: ${credentialsFile}
protocol: quic
ingress:
${rules}
  - service: http_status:404
`;
}
