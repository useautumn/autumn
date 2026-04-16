export default function SectionDivider({ title }: { title: string }) {
	return (
		<>
			<div className="flex flex-col gap-2.5">
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
			</div>
			<div className="w-[calc(100%+calc(var(--page-pad)*2))] -ml-(--page-pad) flex border-y border-[#292929] bg-[#000000] mt-2.5">
				<div className="flex-1 py-6.5 pl-[calc(var(--page-pad)+16px)] xl:pl-[calc(var(--page-pad)+90px)] flex items-center">
					<span className="font-mono text-[#FFFFFF99] text-[14px] tracking-[-2%] leading-[14px] uppercase">
						{`// ${title}`}
					</span>
				</div>
			</div>
		</>
	);
}
