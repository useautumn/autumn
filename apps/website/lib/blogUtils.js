import fs from "fs";
import path from "path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export function getAllPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".mdx"));

  const posts = files.map((filename) => {
    const filePath = path.join(CONTENT_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);

    return {
      slug: data.slug || filename.replace(/\.mdx$/, ""),
      title: data.title || "Untitled",
      description: data.description || "",
      date: data.date || null,
      author: data.author || "Autumn Team",
      image: data.image || null,
    };
  });

  return posts.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date) - new Date(a.date);
  });
}

export function getPostBySlug({ slug }) {
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
        source: content,
      };
    }
  }

  return null;
}
