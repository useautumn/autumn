import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export type BlogPostSummary = {
	slug: string;
	title: string;
	description: string;
	date: string | null;
	author: string;
	image: string | null;
	tags: string[];
	readingTimeMinutes: number;
	draft: boolean;
};

export type BlogPost = BlogPostSummary & {
	source: string;
};

function estimateReadingTime(content: string): number {
	const words = content.trim().split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 200));
}

function parseTags(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((t): t is string => typeof t === "string");
}

export function getAllPosts(): BlogPostSummary[] {
	if (!fs.existsSync(CONTENT_DIR)) return [];

	const files = fs
		.readdirSync(CONTENT_DIR)
		.filter((file) => file.endsWith(".mdx"));

	const isProd = process.env.NODE_ENV === "production";

	const posts = files.map((filename) => {
		const filePath = path.join(CONTENT_DIR, filename);
		const raw = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(raw);

		return {
			slug: data.slug || filename.replace(/\.mdx$/, ""),
			title: data.title || "Untitled",
			description: data.description || "",
			date: data.date || null,
			author: data.author || "Autumn Team",
			image: data.image || null,
			tags: parseTags(data.tags),
			readingTimeMinutes: estimateReadingTime(content),
			draft: data.draft === true,
		};
	});

	const filtered = isProd ? posts.filter((p) => !p.draft) : posts;

	return filtered.sort((a, b) => {
		if (!a.date || !b.date) return 0;
		return new Date(b.date).getTime() - new Date(a.date).getTime();
	});
}

export function getPostBySlug({ slug }: { slug: string }): BlogPost | null {
	if (!fs.existsSync(CONTENT_DIR)) return null;

	const files = fs
		.readdirSync(CONTENT_DIR)
		.filter((file) => file.endsWith(".mdx"));

	for (const filename of files) {
		const filePath = path.join(CONTENT_DIR, filename);
		const raw = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(raw);
		const fileSlug = data.slug || filename.replace(/\.mdx$/, "");

		if (fileSlug === slug) {
			return {
				slug: fileSlug,
				title: data.title || "Untitled",
				description: data.description || "",
				date: data.date || null,
				author: data.author || "Autumn Team",
				image: data.image || null,
				tags: parseTags(data.tags),
				readingTimeMinutes: estimateReadingTime(content),
				draft: data.draft === true,
				source: content,
			};
		}
	}

	return null;
}

export function getAllTags(): string[] {
	const posts = getAllPosts();
	const set = new Set<string>();
	for (const p of posts) for (const t of p.tags) set.add(t);
	return [...set].sort();
}

export function getPostsByTag({ tag }: { tag: string }): BlogPostSummary[] {
	return getAllPosts().filter((p) => p.tags.includes(tag));
}
