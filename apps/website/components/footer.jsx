import Image from "next/image";
import Link from "next/link";

const footerColumns = [
  {
    title: "PRODUCT",
    links: [
      { label: "FEATURES", href: "#" },
      { label: "INTEGRATIONS", href: "#" },
      { label: "PRICING", href: "#" },
      { label: "CHANGELOG", href: "#" },
      { label: "ROADMAP", href: "#" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "OUR TEAM", href: "#" },
      { label: "OUR VALUES", href: "/privacy" },
      { label: "BLOG", href: "/blog" },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { label: "DOWNLOADS", href: "https://useautumn.com/" },
      { label: "DOCUMENTATION", href: "https://docs.useautumn.com/welcome" },
      { label: "CONTACT", href: "https://cal.com/ayrod/a?user=ayrod" },
    ],
  },
];

export default function Footer() {
  return (
    <>
      <footer
        style={{
          width: "calc(100% + var(--page-pad) * 2)",
          marginLeft: "calc(var(--page-pad) * -1)",
          paddingLeft: "var(--page-pad)",
          paddingRight: "var(--page-pad)",
        }}
        className="mt-[50px] relative bg-[#000000] border-t border-[#292929] overflow-hidden text-[#FFFFFF99] grid"
      >
        <div className="col-start-1 row-start-1 flex flex-col z-10 w-full relative">
          <div className="relative w-full flex flex-col justify-between min-h-[400px]">
            <div className="absolute bottom-0 left-0 right-0 h-[300px] sm:h-[550px] lg:h-[400px] pointer-events-none opacity-70 bg-[url('/images/footer/footerbg.svg')] bg-cover sm:bg-contain bg-bottom bg-no-repeat z-0" />

            <div className="flex flex-col lg:flex-row justify-between pt-[32px] md:pt-24 pb-32 md:pb-16 pl-4.5 xl:pl-[90px] pr-4 sm:pr-8 lg:pr-12 gap-10 md:gap-16 lg:gap-8 relative z-10">
              {/* Left Side: Logo and Description */}
              <div className="flex flex-col max-w-sm">
                <Link href="/" className="mb-3 md:mb-6 inline-block">
                  <Image
                    src="/images/navbar/autumnlogo.svg"
                    width={195}
                    height={48}
                    alt="Autumn"
                    className="brightness-0 invert w-[130px] h-[32px] md:w-[195px] md:h-[48px]"
                  />
                </Link>
                <p className="text-[14px] md:text-[16px] leading-[18px] md:leading-[20px] tracking-[-2%] text-[#FFFFFF99] font-light">
                  Autumn is built on top of Stripe Billing (for now), so their
                  fees (0.7%, and 2.9% + 30c) still apply.
                </p>
              </div>

              {/* Right Side: Columns */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 sm:gap-16 lg:gap-24">
                {footerColumns.map((col, index) => (
                  <div key={index} className="flex flex-col">
                    <h3 className="flex items-center gap-2 text-white font-mono text-[14px] uppercase tracking-[-1%] mb-6">
                      <div className="w-[8px] h-[8px] bg-[#FFFFFF99]"></div>
                      {col.title}
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {col.links.map((link, i) => (
                        <li key={i} className="group/strip">
                          <Link
                            href={link.href}
                            target="_blank"
                            className="group/strip flex items-center gap-3 text-[14px] font-mono uppercase tracking-[-1%] transition-colors duration-300"
                          >
                            <span className="w-1 h-1 bg-[#FFFFFF99] group-hover/strip:bg-white group-active/strip:bg-white transition-colors duration-300 shrink-0"></span>

                            <span className="relative">
                              <span className="text-[#FFFFFF99]">
                                {link.label}
                              </span>
                              <span
                                className="absolute inset-y-0 left-0 w-0 group-hover/strip:w-full group-active/strip:w-full overflow-hidden transition-all duration-300 ease-in-out bg-white text-black font-normal pointer-events-none flex items-center"
                                aria-hidden="true"
                              >
                                <span className="whitespace-nowrap">
                                  {link.label}
                                </span>
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="relative block z-10 bg-black/40 backdrop-blur-md border-y border-[#292929]"
            style={{
              width: "calc(100% + var(--page-pad) * 2)",
              marginLeft: "calc(var(--page-pad) * -1)",
              paddingLeft: "var(--page-pad)",
              paddingRight: "var(--page-pad)",
            }}
          >
            <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-stretch h-auto md:h-14 font-mono text-[10px] sm:text-[11px] tracking-[0.2em]">
              {/* Social Left Box */}
              <div className="flex flex-row md:flex-row border-b md:border-b-0 border-[#292929] w-full md:w-auto">
                <div className="px-4 sm:px-8 py-4.5 md:py-0 border-r border-[#292929] tracking-[-2%] flex items-center justify-center md:justify-start text-[12px] md:text-[14px]">
                  SOCIAL
                </div>
                <div className="px-6 sm:px-8 py-4 md:py-0 flex items-center justify-center md:justify-start gap-3 sm:gap-4 md:border-r border-[#292929]">
                  <Link
                    href="https://www.linkedin.com/company/useautumn"
                    className="group/strip flex items-center text-[14px] tracking-[-2%] transition-colors duration-300"
                  >
                    <span className="relative">
                      <span className="text-[#FFFFFF99] group-hover/strip:text-[#ffffff] text-[12px] md:text-[14px] transition-colors duration-300">
                        LINKEDIN
                      </span>
                      <span
                        className="absolute inset-y-0 left-0 w-0 group-hover/strip:w-full group-active/strip:w-full overflow-hidden transition-all duration-300 ease-in-out bg-white text-black font-normal pointer-events-none flex items-center"
                        aria-hidden="true"
                      >
                        <span className="whitespace-nowrap">LINKEDIN</span>
                      </span>
                    </span>
                  </Link>
                  <div className="w-[5px] h-[5px] bg-[#FFFFFF]"></div>
                  <Link
                    href="https://x.com/autumnpricing"
                    className="group/strip flex items-center text-[14px] tracking-[-2%] transition-colors duration-300"
                  >
                    <span className="relative">
                      <span className="text-[#FFFFFF99] group-hover/strip:text-[#ffffff] transition-colors duration-300 text-[12px] md:text-[14px]">
                        TWITTER
                      </span>
                      <span
                        className="absolute inset-y-0 left-0 w-0 group-hover/strip:w-full group-active/strip:w-full overflow-hidden transition-all duration-300 ease-in-out bg-white text-black font-normal pointer-events-none flex items-center"
                        aria-hidden="true"
                      >
                        <span className="whitespace-nowrap">TWITTER</span>
                      </span>
                    </span>
                  </Link>
                </div>
              </div>

              <div className="px-4.5 py-4 md:py-0 flex items-center justify-start md:justify-end text-center md:text-right text-[#FFFFFF99] text-[12px] md:text-[14px] tracking-[-2%] border-b md:border-b-0 border-[#292929] w-full md:w-auto">
                Copyright © 2026 Autumn All rights reserved
                <div className="hidden lg:flex gap-3 ml-[15px] h-[54px]">
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                  <div className="border-r border-[#292929]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
