import type { MetadataRoute } from "next";
import { getAllPosts, getAllTags } from "@/lib/blogUtils";

const SITE_URL = "https://useautumn.com";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	const staticRoutes: MetadataRoute.Sitemap = [
		{
			url: `${SITE_URL}/`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/blog`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${SITE_URL}/privacy`,
			lastModified: now,
			changeFrequency: "yearly",
			priority: 0.3,
		},
	];

	const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
		url: `${SITE_URL}/blog/${post.slug}`,
		lastModified: post.date ? new Date(post.date) : now,
		changeFrequency: "monthly",
		priority: 0.7,
	}));

	const tagRoutes: MetadataRoute.Sitemap = getAllTags().map((tag) => ({
		url: `${SITE_URL}/blog/tag/${tag}`,
		lastModified: now,
		changeFrequency: "weekly",
		priority: 0.5,
	}));

	return [...staticRoutes, ...blogRoutes, ...tagRoutes];
}
