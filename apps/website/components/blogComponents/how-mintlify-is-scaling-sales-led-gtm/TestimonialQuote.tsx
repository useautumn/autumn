import type { ReactNode } from "react";

export function TestimonialQuote({
	avatarAlt,
	avatarSrc,
	children,
	name,
	role,
}: {
	avatarAlt: string;
	avatarSrc: string;
	children: ReactNode;
	name: string;
	role: string;
}) {
	return (
		<div className="not-prose my-6 border-l-2 border-[#9564ff] bg-[#9564ff0d] py-4 pr-5 pl-4">
			<div className="text-[#FFFFFF99] [&>p+p]:mt-3 [&>p]:m-0">{children}</div>
			<div className="mt-3 flex items-center gap-3">
				<div className="h-13 w-13 flex-none overflow-hidden border border-[#292929]">
					<img
						alt={avatarAlt}
						className="h-full w-full scale-125 object-cover object-[50%_20%]"
						src={avatarSrc}
					/>
				</div>
				<div className="leading-[17px]">
					<span className="block font-medium font-sans text-[14px] text-white tracking-[-2%]">
						{name}
					</span>
					<span className="block font-sans text-[13px] text-[#FFFFFF66] tracking-[-2%]">
						{role}
					</span>
				</div>
			</div>
		</div>
	);
}
