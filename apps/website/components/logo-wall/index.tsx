import LogoTile from "./logo-tile";
import { LOGOS } from "./logos";

const FOUR_COLUMN_LOGO_COUNT = 12;

export default function LogoWall() {
	return (
		<section className="w-full overflow-hidden bg-[#0F0F0F]">
			<div className="px-4 xl:px-22.75 py-6 flex items-center justify-center">
				<span className="font-sans text-[14px] font-light text-[#FFFFFF99] tracking-[-2%] leading-5">
					Powering millions of customers for the best startups
				</span>
			</div>

			<div className="relative overflow-hidden">
				<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 mx-4 xl:mx-22.75 border-r border-[#292929]">
					{LOGOS.map((logo, index) => (
						<LogoTile
							key={logo.id}
							logo={logo}
							className={
								index >= FOUR_COLUMN_LOGO_COUNT ? "sm:max-lg:hidden" : undefined
							}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
