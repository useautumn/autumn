import { IconQuotes } from "@/app/constant";

export default function CaseStudyBadge() {
	return (
		<span className="absolute top-3 right-3 flex items-center gap-2">
			<span className="font-mono text-[10px] leading-none tracking-[-2%] uppercase text-[#FFFFFF99] opacity-0 translate-x-1 transition-[opacity,translate] duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0">
				Read story
			</span>
			<IconQuotes
				aria-hidden="true"
				className="h-2.5 w-auto text-[#FFFFFF66] transition-colors duration-200 ease-out group-hover:text-[#b08aff] group-focus-visible:text-[#b08aff]"
			/>
		</span>
	);
}
