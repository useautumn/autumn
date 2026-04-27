import type { MDXComponents } from "mdx/types";
import { mdxComponents } from "@/components/blogComponents";

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return { ...mdxComponents, ...components };
}
