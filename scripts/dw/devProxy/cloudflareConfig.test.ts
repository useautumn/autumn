import { describe, expect, test } from "bun:test";
import {
	KEEP_ALIVE_CONNECTIONS,
	dashboardSlug,
	publicHostSlug,
	publicHostname,
	publicServiceHostname,
	publicServiceUrls,
	publicServiceUrlsFromDashboard,
	publicTunnelIngress,
	publicTunnelName,
	renderTunnelConfig,
} from "./cloudflareConfig.ts";

const wt45 = {
	machineId: "abc",
	path: "/workspace",
	worktreeNum: 45,
};

describe("publicHostname", () => {
	test("is stable for the same machine + path + worktree", () => {
		expect(publicHostname(wt45)).toBe(publicHostname(wt45));
		expect(publicHostname(wt45)).toMatch(
			/^autumn-wt45-[a-f0-9]{6}\.autumnworktree\.com$/,
		);
	});

	test("differs across machines so Cloud wt1 does not collide", () => {
		const cloudA = publicHostname({
			machineId: "vm-one",
			path: "/workspace",
			worktreeNum: 1,
		});
		const cloudB = publicHostname({
			machineId: "vm-two",
			path: "/workspace",
			worktreeNum: 1,
		});
		expect(cloudA).not.toBe(cloudB);
		expect(cloudA).toMatch(/^autumn-wt1-[a-f0-9]{6}\.autumnworktree\.com$/);
	});

	test("differs across paths on the same machine", () => {
		expect(publicHostname({ ...wt45, path: "/tmp/a" })).not.toBe(
			publicHostname({ ...wt45, path: "/tmp/b" }),
		);
	});

	test("tunnel name matches the dashboard DNS label", () => {
		expect(publicTunnelName(wt45)).toBe(publicHostSlug(wt45));
		expect(publicHostname(wt45)).toBe(
			`${publicTunnelName(wt45)}.autumnworktree.com`,
		);
	});
});

describe("publicServiceHostname", () => {
	test("vite is the bare slug; other services get a suffix", () => {
		const slug = publicHostSlug(wt45);
		expect(publicServiceHostname({ slug, service: "vite" })).toBe(
			`${slug}.autumnworktree.com`,
		);
		expect(publicServiceHostname({ slug, service: "api" })).toBe(
			`${slug}-api.autumnworktree.com`,
		);
		expect(publicServiceHostname({ slug, service: "checkout" })).toBe(
			`${slug}-checkout.autumnworktree.com`,
		);
		expect(publicServiceHostname({ slug, service: "leaf" })).toBe(
			`${slug}-leaf.autumnworktree.com`,
		);
		expect(publicServiceHostname({ slug, service: "emulate" })).toBe(
			`${slug}-emulate.autumnworktree.com`,
		);
	});

	test("dashboardSlug strips a service suffix back to the vite slug", () => {
		const slug = publicHostSlug(wt45);
		expect(
			dashboardSlug({
				hostname: publicServiceHostname({ slug, service: "api" }),
			}),
		).toBe(slug);
		expect(
			dashboardSlug({
				hostname: publicServiceHostname({ slug, service: "vite" }),
			}),
		).toBe(slug);
	});
});

describe("publicServiceUrlsFromDashboard", () => {
	test("derives sibling hosts from the vite origin", () => {
		const slug = "autumn-wt45-aa11bb";
		const urls = publicServiceUrlsFromDashboard({
			dashboard: `https://${slug}.autumnworktree.com`,
		});
		expect(urls).toEqual(publicServiceUrls({ slug }));
		expect(urls.vite).toBe(`https://${slug}.autumnworktree.com`);
		expect(urls.api).toBe(`https://${slug}-api.autumnworktree.com`);
	});
});

describe("renderTunnelConfig", () => {
	test("one ingress per service, none of the old /backend folders", () => {
		const slug = "autumn-wt45-aa11bb";
		const ingress = publicTunnelIngress({
			slug,
			ports: {
				api: 12480,
				checkout: 7401,
				emulate: 4000,
				leaf: 7499,
				vite: 7400,
			},
		});
		const file = renderTunnelConfig({
			credentialsFile: "/tmp/cf-wt45.json",
			ingress,
			tunnelId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		});
		expect(file).toContain("tunnel: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
		expect(file).toContain("credentials-file: /tmp/cf-wt45.json");
		expect(file).toContain(`hostname: ${slug}.autumnworktree.com`);
		expect(file).toContain(`hostname: ${slug}-api.autumnworktree.com`);
		expect(file).toContain("service: http://127.0.0.1:7400");
		expect(file).toContain("service: http://127.0.0.1:12480");
		expect(file).toContain(
			`keepAliveConnections: ${KEEP_ALIVE_CONNECTIONS}`,
		);
		expect(file).toContain("service: http_status:404");
		expect(file.match(/service: http:\/\//g)?.length).toBe(5);
		expect(file).not.toContain("/backend");
		expect(file).not.toContain("/leaf");
	});
});
