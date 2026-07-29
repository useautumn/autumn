export function markdownTargetFor(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return "/home.md";
  if (path === "/privacy") return "/privacy.md";
  if (path === "/blog") return "/blog.md";
  if (path === "/alog") return "/alog.md";

  const blogMatch = path.match(/^\/blog\/([^/.]+)$/);
  if (blogMatch) return `/blog/${blogMatch[1]}.md`;

  const alogMatch = path.match(/^\/alog\/([^/.]+)$/);
  if (alogMatch) return `/alog/${alogMatch[1]}.md`;

  return null;
}
