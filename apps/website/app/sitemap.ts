import type { MetadataRoute } from "next";
import { getAllAlogDocs } from "@/lib/alogUtils";
import { getAllPosts } from "@/lib/blogUtils";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: SITE_URL, changeFrequency: "weekly", priority: 1 },
		{ url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
		{ url: `${SITE_URL}/alog`, changeFrequency: "weekly", priority: 0.8 },
		{ url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
	];

	const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
		url: `${SITE_URL}/blog/${post.slug}`,
		lastModified: post.date ? new Date(post.date) : undefined,
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	const alogRoutes: MetadataRoute.Sitemap = getAllAlogDocs().map((doc) => ({
		url: `${SITE_URL}/alog/${doc.slug}`,
		lastModified: doc.updated ? new Date(doc.updated) : undefined,
		changeFrequency: "monthly",
		priority: 0.7,
	}));

	return [...staticRoutes, ...blogRoutes, ...alogRoutes];
}
