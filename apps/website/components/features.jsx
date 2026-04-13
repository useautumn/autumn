"use client";
import { featuresData } from "@/app/constant";
import { useRef } from "react";
import { FeatureIconAnimation } from "./feature-icon-animation";

function FeatureCard({ feature }) {
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover)").matches;
  const iconRef = useRef(null);
  return (
    <div
      onMouseEnter={() => isDesktop && iconRef.current?.play()}
      onMouseLeave={() => isDesktop && iconRef.current?.reverse()}
      className="group relative flex px-4 md:px-4 flex-col justify-between p-6 bg-[#0F0F0F] min-h-[200px] md:min-h-[280px] border-r border-b border-[#292929] overflow-hidden cursor-pointer"
    >
      <div className="absolute inset-0 opacity-0 translate-y-6 md:group-hover:opacity-100 md:group-hover:translate-y-0 pointer-events-none z-0 hidden md:block">
        <video
          src="/images/features/pixel effect.webm"
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
      </div>
      {/* Hover Gradient Overlay */}
      <div className="absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(to_bottom,rgba(10,10,10,0)_0%,rgba(135,82,250,0.15)_40%,rgba(135,82,250,0.45)_70%,rgba(135,82,250,0.85)_90%)] opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-full gap-[42px] md:gap-24.5">
        <feature.Icon className="w-6 h-6 text-white md:hidden" />
        <div className="hidden md:block">
          <FeatureIconAnimation Icon={feature.Icon} ref={iconRef} />
        </div>
        <div className="flex flex-col gap-2 md:gap-4.5">
          <h3 className="text-white font-normal tracking-[-5%] leading-6 text-[20px] md:text-[24px] font-sans">
            {feature.title}
          </h3>
          <p className="text-[#FFFFFF99] w-full font-light tracking-[-2%] text-[14px] md:text-[16px] font-sans leading-[18px] md:leading-[20px] pr-2 md:pr-4 text-pretty">
            {feature.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section className="bg-[#000000] w-full">
      <div className="flex flex-col px-4 md:px-4 sm:px-8 py-12 md:py-16 xl:px-22.75 items-start">
        <h2 className="text-[30px] md:text-[40px] leading-[32px] md:leading-[44px] font-sans tracking-[-4%]">
          <div className="text-[#FFFFFF99]">Everything you need.</div>
          <div className="text-white">Nothing you have to build.</div>
        </h2>
        <div className="mt-4 text-[16px] tracking-[-2%] font-sans font-light text-[#FFFFFF99] leading-[20px] max-w-[420px]">
          Eight features that eliminate your entire{" "}
          <span className="text-white">
            billing infrastructure, fully managed.
          </span>
        </div>
      </div>

      <div className="border-t border-[#292929] w-full" />
      <div className="grid grid-cols-1 gap-[-3px]  md:grid-cols-2 lg:grid-cols-3 xl:px-22.75 border-[#292929] [&>*:last-child]:border-b-0 [&>*:nth-last-child(2)]:border-b-0 md:[&>*:nth-last-child(-n+2)]:border-b-0 lg:[&>*:nth-last-child(-n+3)]:border-b-0 *:border-l md:[&>*:nth-child(2n)]:border-l-0 lg:[&>*:nth-child(3n+1)]:border-l lg:[&>*:nth-child(3n+2)]:border-l-0 lg:[&>*:nth-child(3n)]:border-l-0">
        {featuresData.map((feature, i) => (
          <FeatureCard key={i} feature={feature} />
        ))}
        <div className="bg-[#0f0f0f] w-full h-full min-h-[280px] hidden lg:block border-r border-b border-[#292929]" />
      </div>
    </section>
  );
}
