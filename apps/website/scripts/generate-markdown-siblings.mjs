#!/usr/bin/env node
// @ts-check
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const APP_ROOT = process.cwd(); // expected to be apps/website when run from package.json script
const NEXT_BUILD_DIR = path.join(APP_ROOT, ".next", "server", "app");
const OUTPUT_DIR = path.join(APP_ROOT, "public", "_md");
const CONTENT_BLOG_DIR = path.join(APP_ROOT, "content", "blog");

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	emDelimiter: "_",
});
turndown.use(gfm);

// Strip nav, footer, and other chrome from HTML before conversion.
// We target the <main> or first <article> if available; else strip known chrome selectors.
function extractMainContent(html) {
	// Minimal DOM-less cleanup: remove <script>, <style>, <noscript>, and common chrome by tag.
	const cleaned = html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
		.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
		.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
		.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");
	// Prefer <main>...</main> or <article>...</article> if present.
	const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
	if (mainMatch) return mainMatch[1];
	const articleMatch = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
	if (articleMatch) return articleMatch[1];
	return cleaned;
}

async function ensureDir(dir) {
	await fs.mkdir(dir, { recursive: true });
}

async function writeMd(outputPath, content) {
	await ensureDir(path.dirname(outputPath));
	await fs.writeFile(outputPath, content, "utf8");
}

async function generateBlogPostsFromSource() {
	const results = [];
	let files = [];
	try {
		files = await fs.readdir(CONTENT_BLOG_DIR);
	} catch {
		return results;
	}
	for (const filename of files) {
		if (!filename.endsWith(".mdx")) continue;
		const filePath = path.join(CONTENT_BLOG_DIR, filename);
		const raw = await fs.readFile(filePath, "utf8");
		const { data, content } = matter(raw);
		const slug = data.slug || filename.replace(/\.mdx$/, "");
		const header = [
			`# ${data.title || "Untitled"}`,
			"",
			data.description ? `> ${data.description}` : null,
			"",
			data.date
				? `*Published ${data.date}${data.author ? ` by ${data.author}` : ""}*`
				: null,
			Array.isArray(data.tags) && data.tags.length
				? `Tags: ${data.tags.join(", ")}`
				: null,
			"",
			"---",
			"",
		]
			.filter((line) => line !== null)
			.join("\n");
		const body = `${header}${content.trim()}\n`;
		const outputPath = path.join(OUTPUT_DIR, "blog", `${slug}.md`);
		await writeMd(outputPath, body);
		results.push(outputPath);
	}
	return results;
}

async function findBuiltHtml(routePath) {
	// routePath is e.g. "/", "/blog", "/privacy", "/blog/tag/billing"
	// Next 16 stores prerendered HTML at .next/server/app/<route>.html (index for root) or <route>/page.html variants
	const candidates =
		routePath === "/"
			? [
					path.join(NEXT_BUILD_DIR, "index.html"),
					path.join(NEXT_BUILD_DIR, "page.html"),
				]
			: [
					path.join(NEXT_BUILD_DIR, `${routePath}.html`),
					path.join(NEXT_BUILD_DIR, routePath, "page.html"),
					path.join(NEXT_BUILD_DIR, routePath, "index.html"),
				];
	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// try next
		}
	}
	return null;
}

async function convertHtmlFileToMd(htmlPath) {
	const html = await fs.readFile(htmlPath, "utf8");
	const main = extractMainContent(html);
	return turndown.turndown(main);
}

async function generateStaticRoutes() {
	const routes = ["/", "/blog", "/privacy"];
	const results = [];
	for (const route of routes) {
		const htmlPath = await findBuiltHtml(route);
		if (!htmlPath) {
			console.warn(`[md-siblings] No built HTML found for ${route}; skipping`);
			continue;
		}
		const md = await convertHtmlFileToMd(htmlPath);
		const outputPath =
			route === "/"
				? path.join(OUTPUT_DIR, "index.md")
				: path.join(OUTPUT_DIR, `${route.replace(/^\//, "")}.md`);
		// Special: /blog should be blog/index.md for cleanliness
		const normalizedOutput =
			route === "/blog"
				? path.join(OUTPUT_DIR, "blog", "index.md")
				: outputPath;
		await writeMd(normalizedOutput, md);
		results.push(normalizedOutput);
	}
	return results;
}

async function generateTagPages() {
	// Enumerate tag directories under .next/server/app/blog/tag
	const tagRoot = path.join(NEXT_BUILD_DIR, "blog", "tag");
	const results = [];
	let entries = [];
	try {
		entries = await fs.readdir(tagRoot, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const tag = entry.name;
		const htmlPath = await findBuiltHtml(`/blog/tag/${tag}`);
		if (!htmlPath) continue;
		const md = await convertHtmlFileToMd(htmlPath);
		const outputPath = path.join(OUTPUT_DIR, "blog", "tag", `${tag}.md`);
		await writeMd(outputPath, md);
		results.push(outputPath);
	}
	return results;
}

async function main() {
	console.log("[md-siblings] generating markdown siblings...");
	await ensureDir(OUTPUT_DIR);
	const blogPosts = await generateBlogPostsFromSource();
	const staticRoutes = await generateStaticRoutes();
	const tagPages = await generateTagPages();
	const total = blogPosts.length + staticRoutes.length + tagPages.length;
	console.log(
		`[md-siblings] wrote ${total} files to ${path.relative(APP_ROOT, OUTPUT_DIR)}`,
	);
	if (total === 0) {
		console.warn(
			"[md-siblings] wrote 0 files. Check that `next build` ran and produced static HTML.",
		);
	}
}

main().catch((err) => {
	console.error("[md-siblings] failed:", err);
	process.exitCode = 1;
});
