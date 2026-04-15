import { getAllPosts } from "@/lib/blogUtils";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Blog",
  description:
    "Thoughts on billing infrastructure, usage-based pricing, and building for AI startups.",
};

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogListingPage() {
  const posts = getAllPosts();

  return (
    <div className="py-16 md:py-24 bg-[#0F0F0F]">
      <div className="max-w-[800px] mx-auto px-4 xl:px-0">
        <h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans mb-4">
          <span className="text-[#FFFFFF99] font-light">From the </span>
          <span className="text-white">Blog</span>
        </h1>
        <p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans mb-16">
          Thoughts on billing infrastructure, usage-based pricing, and building
          for AI startups.
        </p>

        {posts.length === 0 && (
          <p className="text-[#FFFFFF66] text-center py-16 font-light">
            No posts yet. Check back soon.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex items-center gap-6 border border-[#292929] hover:border-[#3f3f3f] hover:bg-[#080808] transition-colors duration-300 p-6 md:p-8"
            >
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66]">
                  <span>{formatDate(post.date)}</span>
                  <span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
                  <span>{post.author}</span>
                </div>
                <h2 className="font-sans text-[18px] md:text-[22px] tracking-[-2%] leading-[1.25] font-normal text-white group-hover:text-[#9564ff] transition-colors duration-300">
                  {post.title}
                </h2>
                {post.description && (
                  <p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans">
                    {post.description}
                  </p>
                )}
              </div>
              {post.image && (
                <div className="relative hidden sm:block w-[140px] md:w-[180px] aspect-[3/2] overflow-hidden shrink-0">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
