import { IconBlog } from "@/app/constant";

export default function CaseStudyBadge() {
	return (
		<span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
			<span className="font-mono text-[10px] leading-none tracking-[-2%] uppercase text-[#FFFFFF99] opacity-0 translate-x-1 transition-[opacity,translate] duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
				Read story
			</span>
			<IconBlog className="size-2.5 text-[#9564ff]" />
		</span>
	);
}
