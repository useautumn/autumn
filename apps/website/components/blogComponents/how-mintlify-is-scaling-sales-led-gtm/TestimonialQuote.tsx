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
			<div className="text-[#FFFFFF99] [&>p+p]:mt-3 [&>p]:m-0">
				{children}
			</div>
			<div className="mt-3 flex items-center gap-3">
				<div className="h-11 w-11 flex-none overflow-hidden rounded-full border border-[#292929]">
					<img
						alt={avatarAlt}
						className="h-full w-full scale-125 object-cover object-[50%_20%]"
						src={avatarSrc}
					/>
				</div>
				<div className="font-mono text-[14px] text-[#FFFFFF66]">
					{name}, {role}
				</div>
			</div>
		</div>
	);
}
