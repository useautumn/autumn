import type { Metadata } from "next";
import AnimatedFooterImage from "@/components/animated-footer-image";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import { termsOfService } from "@/lib/termsContent";
import type { PageStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Autumn's Terms of Service covering use of our billing infrastructure, APIs, and SDKs.",
  alternates: { canonical: "/terms" },
};

export default function TermsOfService() {
  return (
    <div
      className="w-full overflow-x-hidden overflow-y-auto bg-[#000000]"
      style={
        { "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
      }
    >
      <div className="relative z-10 bg-[#000000] min-h-screen">
        <div className="relative w-full px-4 md:px-(--page-pad) pt-5">
          <div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
          <div className="absolute pointer-events-none left-0 border-t border-[#292929] w-full" />
          <Navbar />
          <div className="absolute pointer-events-none left-0 border-b border-[#292929] w-full" />
          <div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

          <div className="flex flex-col gap-2.5">
            <div className="border-t border-[#292929] w-full" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
          </div>

          <div className="flex w-full flex-col border-b border-[#292929]">
            <div className="flex w-full border-b border-[#292929]">
              <div className="hidden md:block w-1/8 lg:w-1/6 border-r bg-[#0F0F0F] border-[#292929]" />
              <div className="flex-1 bg-[#0F0F0F] px-4 sm:px-8 py-10 md:py-16">
                <h1 className="text-white text-[40px] font-sans tracking-[-2%] uppercase">
                  Terms of Service
                </h1>
              </div>
              <div className="hidden md:block w-1/8 lg:w-1/6 border-l bg-[#0F0F0F] border-[#292929]" />
            </div>

            <div className="flex w-full">
              <div className="hidden md:block w-1/8 lg:w-1/6 border-r border-[#292929]" />
              <div className="flex-1 px-4 sm:px-8 py-12 md:py-16 text-white text-[16px] font-light leading-[1.6] tracking-[-2%] font-sans pb-32">
                <p className="mb-10">
                  Autumn (Recase, Inc.)
                  <br />
                  Effective Date: February 1, 2025
                </p>

                {termsOfService.map((term) => (
                  <div key={term.title}>
                    <h3 className="mb-2 mt-8 text-[24px] leading-[30px] font-normal tracking-[-2%] text-white">
                      {term.title}
                    </h3>
                    <p
                      className={cn(
                        "mb-6 text-[16px] leading-[20px] font-light tracking-[-2%] md:leading-[24px]",
                        term.isUppercase && "uppercase",
                      )}
                    >
                      {term.content}
                    </p>
                  </div>
                ))}
              </div>
              <div className="hidden md:block w-1/8 lg:w-1/6 border-l border-[#292929]" />
            </div>
          </div>

          <Footer />
        </div>

        <div className="w-full flex-col gap-2.5 mt-10.5 hidden md:flex mb-4">
          <div className="border-t border-[#292929] w-full" />
          <div className="border-t border-[#292929] w-full" />
          <div className="border-t border-[#292929] w-full" />
          <div className="border-t border-[#292929] w-full" />
          <div className="border-t border-[#292929] w-full" />
        </div>
      </div>

      <div className="w-full aspect-390/313 sm:aspect-1440/619" />
      <AnimatedFooterImage />
    </div>
  );
}
