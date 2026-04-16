import { getAllPosts, getPostBySlug } from "@/lib/blogUtils";
import { mdxComponents } from "@/components/blogComponents";
import { MDXRemote } from "next-mdx-remote/rsc";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = getPostBySlug({ slug });
  if (!post) return { title: "Post Not Found" };

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      ...(post.image && {
        images: [{ url: post.image }],
      }),
    },
  };
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = getPostBySlug({ slug });
  if (!post) notFound();

  return (
    <div className="py-16 md:py-24 bg-[#0F0F0F]">
      <div className="max-w-[720px] mx-auto px-4 xl:px-0">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] hover:text-white transition-colors duration-300 mb-10"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="rotate-180"
          >
            <path
              d="M6 3L11 8L6 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to blog
        </Link>

        <header className="mb-12">
          <div className="flex items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] mb-4">
            <span>{formatDate(post.date)}</span>
            <span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
            <span>{post.author}</span>
          </div>
          <h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans text-white mb-4">
            {post.title}
          </h1>
          {post.description && (
            <p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans">
              {post.description}
            </p>
          )}
        </header>

        {post.image && (
          <div className="relative w-full aspect-[2/1] overflow-hidden border border-[#292929] mb-12">
            <Image
              src={post.image}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        <hr className="border-[#292929] mb-12" />

        <article className="prose prose-invert prose-lg max-w-none">
          <MDXRemote source={post.source} components={mdxComponents} />
        </article>
      </div>
    </div>
  );
}
