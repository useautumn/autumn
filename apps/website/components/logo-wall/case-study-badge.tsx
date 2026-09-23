export default function CaseStudyBadge() {
	return (
		<>
			<span className="absolute right-2 bottom-1.5 sm:right-2.5 sm:bottom-2 flex items-center gap-1 font-sans text-[10px] sm:text-[11px] leading-none tracking-[-2%] text-[#b08aff] opacity-0 translate-y-0.5 transition-[opacity,translate] duration-200 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0">
				Read story
				<span aria-hidden="true">&#8599;</span>
			</span>
			<span
				aria-hidden="true"
				className="absolute inset-x-0 -bottom-px z-10 h-px bg-[#9564ff80] transition-colors duration-200 ease-out group-hover:bg-[#9564ff] group-focus-visible:bg-[#9564ff]"
			/>
		</>
	);
}
