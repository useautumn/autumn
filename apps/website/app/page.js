import { Analytics } from "@vercel/analytics/next";
import ElasticRecoil from "@/components/elastic-footer";
import HomeSections from "@/components/home-sections";
import Navbar from "@/components/navbar";
import Preloader from "@/components/preloader";

export default function Home() {
	return (
		<div
			className="w-full overflow-x-clip"
			style={{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" }}
		>
			<Preloader />
			<ElasticRecoil>
				<div className="relative z-10 bg-[#000000] min-h-screen">
					<div className="relative w-full px-4 md:px-(--page-pad) pt-5">
						<div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
						<Navbar />
						<div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

						<div className="flex flex-col gap-2.5">
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full hidden md:block" />
							<div className="border-t border-[#292929] w-full hidden md:block" />
							<div className="border-t border-[#292929] w-full hidden md:block" />
							<div className="border-t border-[#292929] w-full hidden md:block" />
						</div>
						<HomeSections />

						<div className="w-full flex-col gap-2.5 mt-10.5 hidden md:flex">
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
						</div>
					</div>
				</div>
			</ElasticRecoil>
			<Analytics />
		</div>
	);
}
