import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blogUtils";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: SITE_URL, changeFrequency: "weekly", priority: 1 },
		{ url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
		{ url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
	];

	const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
		url: `${SITE_URL}/blog/${post.slug}`,
		lastModified: post.date ? new Date(post.date) : undefined,
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	return [...staticRoutes, ...blogRoutes];
}
