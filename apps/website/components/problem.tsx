"use client";

import dynamic from "next/dynamic";
import { ProblemBgSvg } from "../app/constant";

const ProblemAnimation = dynamic(() => import("./problem-animation"), {
	ssr: false,
});

export default function Problem() {
	return (
		<section className="bg-[#000000]">
			{/* <div
				className="w-full py-5 border-l border-r border-[#292929]"
				style={{ backgroundColor: "rgba(229, 46, 185, 0.12)" }}
			>
				<div className="flex items-start md:items-center gap-2 pl-4 xl:pl-[90px]">
					<Image
						src="/images/problems/warning.svg"
						width={18}
						height={16}
						alt="warning"
						className="shrink-0 mt-1 md:mt-0"
						style={{ width: "auto", height: "auto" }}
					/>
					<p className="text-[#D942B5] font-light tracking-[-2%] text-[14px] md:text-[16px] xl:text-[16px] leading-[18px] md:leading-[20px]">
						<span className="font-light mr-1">The hidden complexity:</span>
						Payment processors move money. They don&apos;t handle the state
						management that happens between payments.
					</p>
				</div>
			</div> */}
			<div className="grid xl:grid-cols-2 gap-0 xl:h-[800px]">
				{/* LEFT COLUMN */}
				<div className="bg-[#0D0D0D] flex flex-col border-r border-[#292929] border-l border-l-[#292929] pb-[20px] md:pb-0">
					<div className="flex flex-col mb-2 gap-3 pl-[28px] xl:pl-[90px] pr-6 xl:pr-8 pt-14 sm:pt-16 xl:pt-16 items-center xl:items-start">
						<h2 className="font-normal tracking-[-4%] leading-[32px] xl:leading-[40px] mb-2 xl:mb-4 text-center xl:text-left">
							<span className="block text-[#686868] text-[30px] md:text-[36px] xl:text-[40px]">
								Say goodbye to the 
							</span>
							<span className="block text-white text-[30px] md:text-[36px] xl:text-[40px]">
								old way of billing.
							</span>
						</h2>
						<p className="text-[#888888] font-light text-[16px] md:text-[18px] xl:text-[16px] tracking-[-2%] leading-[20px] mb-8 xl:mb-10 max-w-sm md:max-w-lg xl:max-w-sm text-center xl:text-left">
							Maintaining payment logic, customer balances and feature access
							across pricing and product changes is months of work.
							<span className="text-white">
								{" "}
								Autumn replaces all the billing code you're building yourself.
							</span>
						</p>
					</div>

					<div className="mt-auto">
						<div className="grid grid-cols-2 xl:grid-cols-3 border-t border-b border-[#1E1E1E] xl:pl-[66px]">
						{[
							{
								title: "Speed.",
								description:
									"Launch faster and maintain less code. Your coding agents will thank you.",
							},
							{
								title: "Flexibility.",
								description:
									"Grow revenue by pricing how you want. No code changes needed.",
							},
							{
								title: "Reliability.",
								description:
									"Declines, 3DS and edge cases handled. Contracts always accurate.",
							},
						].map((stat, i) => (
							<div
								key={i}
								className={`py-6 pr-9 border-[#292929] border-r
      ${i === 2 ? "col-span-2 xl:col-span-1 border-t xl:border-t-0 border-r-0" : ""}
      ${i === 1 ? "border-r-0 xl:border-r" : ""}
      pl-4 xl:pl-6`}
							>
								<p className="text-white tracking-[-5%] font-normal text-[16px] xl:text-[18px] leading-none">
								{stat.title}
							</p>
							<p className="text-[#767676] font-light tracking-[-5%] text-[14px] xl:text-[15px] mt-1.5 leading-[18px]">
									{stat.description}
								</p>
							</div>
						))}
						</div>

						<ProblemBgSvg />
					</div>
				</div>

				{/* RIGHT COLUMN — problem animation */}
				<div className="relative overflow-hidden">
					<ProblemAnimation />
				</div>
			</div>
		</section>
	);
}
