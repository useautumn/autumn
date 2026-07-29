import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "content", "alog");

export type AlogLink = { label: string; href: string };

export const ALOG_CATEGORIES = [
	"Comparisons",
	"Concepts",
	"Integration Notes",
	"Pricing Models",
] as const;

export type AlogCategory = (typeof ALOG_CATEGORIES)[number];

export type AlogSummary = {
	slug: string;
	title: string;
	description: string;
	date: string | null;
	updated: string | null;
	author: string;
	category: AlogCategory;
	summary: string;
	relatedDocs: AlogLink[];
	relatedAlog: string[];
};

export type AlogDoc = AlogSummary & { source: string };

function parseSummary(filename: string, raw: string): AlogSummary {
	const { data } = matter(raw);
	const category = ALOG_CATEGORIES.includes(data.category)
		? (data.category as AlogCategory)
		: "Concepts";

	return {
		slug: data.slug || filename.replace(/\.mdx$/, ""),
		title: data.title || "Untitled",
		description: data.description || "",
		date: data.date || null,
		updated: data.updated || data.date || null,
		author: data.author || "Autumn",
		category,
		summary: data.summary || data.description || "",
		relatedDocs: Array.isArray(data.relatedDocs) ? data.relatedDocs : [],
		relatedAlog: Array.isArray(data.relatedAlog) ? data.relatedAlog : [],
	};
}

export function getAllAlogDocs(): AlogSummary[] {
	if (!fs.existsSync(CONTENT_DIR)) return [];

	return fs
		.readdirSync(CONTENT_DIR)
		.filter((file) => file.endsWith(".mdx"))
		.map((filename) => {
			const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
			return parseSummary(filename, raw);
		})
		.sort((a, b) => a.title.localeCompare(b.title));
}

export function getAlogDocsByCategory(): Array<{
	category: AlogCategory;
	docs: AlogSummary[];
}> {
	const all = getAllAlogDocs();
	return ALOG_CATEGORIES.map((category) => ({
		category,
		docs: all.filter((doc) => doc.category === category),
	})).filter((group) => group.docs.length > 0);
}

export function getAlogDocBySlug({ slug }: { slug: string }): AlogDoc | null {
	if (!fs.existsSync(CONTENT_DIR)) return null;

	const files = fs
		.readdirSync(CONTENT_DIR)
		.filter((file) => file.endsWith(".mdx"));

	for (const filename of files) {
		const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
		const fileSlug = matter(raw).data.slug || filename.replace(/\.mdx$/, "");
		if (fileSlug === slug) {
			return { ...parseSummary(filename, raw), source: matter(raw).content };
		}
	}

	return null;
}
