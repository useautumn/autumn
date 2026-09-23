export default function CaseStudyBadge() {
	return (
		<>
			<span className="absolute right-2 bottom-1.5 sm:right-2.5 sm:bottom-2 flex items-center gap-1 font-sans text-[10px] sm:text-[11px] leading-none tracking-[-2%] text-[#b08affb3] transition-colors duration-200 ease-out group-hover:text-[#b08aff] group-focus-visible:text-[#b08aff]">
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
