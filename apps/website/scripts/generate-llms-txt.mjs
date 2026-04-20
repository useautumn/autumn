#!/usr/bin/env node
// @ts-check
/**
 * Generates /public/llms.txt per the llms.txt convention (llmstxt.org).
 *
 * Structure:
 *   # Autumn
 *   > <blurb>
 *
 *   ## Pages
 *   - [Title](https://useautumn.com/path): optional description
 *
 *   ## Blog
 *   - [Post title](https://useautumn.com/blog/slug): post description
 *
 *   ## Tags
 *   - [tag](https://useautumn.com/blog/tag/<tag>)
 *
 * Routes are discovered from the prerendered HTML under .next/server/app,
 * so this file stays in lock-step with whatever Next.js actually built.
 * Blog posts are enriched from the MDX frontmatter for accurate titles.
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const APP_ROOT = process.cwd();
const NEXT_BUILD_DIR = path.join(APP_ROOT, ".next", "server", "app");
const CONTENT_BLOG_DIR = path.join(APP_ROOT, "content", "blog");
const OUTPUT_PATH = path.join(APP_ROOT, "public", "llms.txt");

const SITE_URL = "https://useautumn.com";
const SITE_NAME = "Autumn";
const BLURB =
	"Autumn is the drop-in billing layer for AI startups. We handle usage limits, credit ledgers, subscriptions, and payments on top of Stripe so teams can stop rebuilding billing logic and focus on their product. Autumn is open source and built for developers shipping AI and usage-based products.";

async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

/**
 * Walk .next/server/app recursively and collect the list of route paths that
 * Next.js prerendered to HTML. Each entry is a URL path like "/" or "/blog/attach".
 * We look for `.html` sibling files emitted by the static generator.
 */
async function collectStaticRoutes() {
	if (!(await pathExists(NEXT_BUILD_DIR))) return [];

	const routes = new Set();

	/** @param {string} dir */
	async function walk(dir) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip Next internals
				if (entry.name.startsWith("_")) continue;
				await walk(full);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith(".html")) continue;

			// Convert the built HTML path to a URL path.
			//   .next/server/app/index.html          -> /
			//   .next/server/app/blog.html           -> /blog
			//   .next/server/app/blog/attach.html    -> /blog/attach
			//   .next/server/app/blog/tag/billing.html -> /blog/tag/billing
			const rel = path.relative(NEXT_BUILD_DIR, full);
			const withoutExt = rel.replace(/\.html$/, "");
			let urlPath =
				withoutExt === "index"
					? "/"
					: `/${withoutExt.split(path.sep).join("/")}`;

			// Some builds emit `<route>/page.html` or `<route>/index.html`.
			urlPath = urlPath.replace(/\/(page|index)$/, "");
			if (urlPath === "") urlPath = "/";

			// Filter out error / special routes.
			const segments = urlPath.split("/").filter(Boolean);
			const hasUnderscoreSegment = segments.some((s) => s.startsWith("_"));
			if (
				hasUnderscoreSegment ||
				urlPath === "/404" ||
				urlPath === "/500" ||
				urlPath.startsWith("/api/")
			)
				continue;

			routes.add(urlPath);
		}
	}

	await walk(NEXT_BUILD_DIR);
	return [...routes].sort();
}

/**
 * Read frontmatter for every blog post so we can emit accurate titles /
 * descriptions in the Blog section (rather than guessing from the route name).
 */
async function readBlogPosts() {
	if (!(await pathExists(CONTENT_BLOG_DIR))) return [];
	const files = await fs.readdir(CONTENT_BLOG_DIR);
	const posts = [];
	for (const filename of files) {
		if (!filename.endsWith(".mdx")) continue;
		const raw = await fs.readFile(
			path.join(CONTENT_BLOG_DIR, filename),
			"utf8",
		);
		const { data } = matter(raw);
		if (data.draft === true) continue;
		posts.push({
			slug: data.slug || filename.replace(/\.mdx$/, ""),
			title: data.title || filename.replace(/\.mdx$/, ""),
			description: data.description || "",
			date: data.date || null,
		});
	}
	// Newest first
	posts.sort((a, b) => {
		if (!a.date || !b.date) return 0;
		return new Date(b.date).getTime() - new Date(a.date).getTime();
	});
	return posts;
}

/**
 * Friendly title for non-blog routes. Blog post titles come from frontmatter;
 * these are for the root, /blog, /privacy, etc.
 */
function titleForRoute(route) {
	const map = {
		"/": "Home — Billing infrastructure for AI startups",
		"/blog": "Blog",
		"/privacy": "Privacy & Terms",
	};
	if (map[route]) return map[route];
	// Tag archive
	const tagMatch = route.match(/^\/blog\/tag\/(.+)$/);
	if (tagMatch) return `Posts tagged "${tagMatch[1]}"`;
	// Default: last path segment, prettified
	const last = route.split("/").filter(Boolean).pop() || route;
	return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function descriptionForRoute(route) {
	const map = {
		"/": "Drop-in billing layer for AI startups. Usage limits, credit ledgers, subscriptions, and Stripe integration in one API.",
		"/blog":
			"Engineering deep-dives, product decisions, and notes on building billing infrastructure for AI companies.",
		"/privacy":
			"Autumn's privacy policy and terms of service covering data handling across our billing infrastructure.",
	};
	if (map[route]) return map[route];
	const tagMatch = route.match(/^\/blog\/tag\/(.+)$/);
	if (tagMatch) return `All Autumn blog posts tagged ${tagMatch[1]}.`;
	return "";
}

function formatLink({ title, url, description }) {
	return description
		? `- [${title}](${url}): ${description}`
		: `- [${title}](${url})`;
}

async function main() {
	const [routes, posts] = await Promise.all([
		collectStaticRoutes(),
		readBlogPosts(),
	]);

	if (routes.length === 0) {
		console.warn(
			"[llms.txt] no prerendered routes found under .next/server/app. Run `next build` first.",
		);
	}

	const postSlugs = new Set(posts.map((p) => `/blog/${p.slug}`));
	const pagesSection = [];
	const tagsSection = [];

	for (const route of routes) {
		if (postSlugs.has(route)) continue; // rendered in Blog section below
		if (route.startsWith("/blog/tag/")) {
			tagsSection.push(
				formatLink({
					title: titleForRoute(route),
					url: `${SITE_URL}${route}`,
					description: descriptionForRoute(route),
				}),
			);
			continue;
		}
		pagesSection.push(
			formatLink({
				title: titleForRoute(route),
				url: `${SITE_URL}${route}`,
				description: descriptionForRoute(route),
			}),
		);
	}

	const blogSection = posts.map((p) =>
		formatLink({
			title: p.title,
			url: `${SITE_URL}/blog/${p.slug}`,
			description: p.description,
		}),
	);

	const lines = [`# ${SITE_NAME}`, "", `> ${BLURB}`, ""];

	if (pagesSection.length > 0) {
		lines.push("## Pages", "", ...pagesSection, "");
	}
	if (blogSection.length > 0) {
		lines.push("## Blog", "", ...blogSection, "");
	}
	if (tagsSection.length > 0) {
		lines.push("## Tags", "", ...tagsSection, "");
	}

	lines.push("## Resources", "");
	lines.push(
		formatLink({
			title: "API documentation",
			url: "https://docs.useautumn.com",
			description: "Reference docs and guides for the Autumn API.",
		}),
	);
	lines.push(
		formatLink({
			title: "OpenAPI specification",
			url: "https://raw.githubusercontent.com/useautumn/autumn/refs/heads/dev/packages/openapi/openapi.yml",
			description: "Machine-readable OpenAPI spec for the Autumn API.",
		}),
	);
	lines.push(
		formatLink({
			title: "API catalog",
			url: `${SITE_URL}/.well-known/api-catalog`,
			description:
				"RFC 9727 linkset advertising our service-desc and service-doc.",
		}),
	);
	lines.push(
		formatLink({
			title: "Sitemap",
			url: `${SITE_URL}/sitemap.xml`,
			description: "XML sitemap of canonical URLs.",
		}),
	);
	lines.push("");

	const output = `${lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()}\n`;
	await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await fs.writeFile(OUTPUT_PATH, output, "utf8");

	console.log(
		`[llms.txt] wrote ${routes.length} routes (${posts.length} posts) to ${path.relative(
			APP_ROOT,
			OUTPUT_PATH,
		)}`,
	);
}

main().catch((err) => {
	console.error("[llms.txt] failed:", err);
	process.exitCode = 1;
});
