"use client";

import { CTALines, IconCTADocs, IconCTAStart } from "@/app/constant";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AutumnConfig from "./autumn-config";
// import dynamic from "next/dynamic";

// const AutumnConfig = dynamic(() => import("./autumn-config"), { ssr: false });

const BADGE_TEXT = "// billing infrastructure for ai";

export default function Hero() {
  const containerRef = useRef(null);
  const heroTlRef = useRef(null);
  const [displayedText, setDisplayedText] = useState("");

  // Badge typewriter
  useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*0123456789";
    let intervalId;
    let timeoutId;

    const startTypewriter = () => {
      timeoutId = setTimeout(() => {
        let iteration = 0;
        intervalId = setInterval(() => {
          setDisplayedText(
            BADGE_TEXT.split("")
              .map((char, index) => {
                if (char === " ") return " ";
                if (index < Math.floor(iteration)) return char;
                if (index === Math.floor(iteration))
                  return chars[Math.floor(Math.random() * chars.length)];
                return "";
              })
              .join(""),
          );

          iteration += 0.4;

          if (iteration >= BADGE_TEXT.length) {
            clearInterval(intervalId);
            setDisplayedText(BADGE_TEXT);
          }
        }, 30);
      }, 150);
    };

    window.addEventListener("preloader:complete", startTypewriter, {
      once: true,
    });
    return () => {
      window.removeEventListener("preloader:complete", startTypewriter);
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handler = () => heroTlRef.current?.play();
    window.addEventListener("preloader:complete", handler, { once: true });
    return () => window.removeEventListener("preloader:complete", handler);
  }, []);

  useGSAP(
    () => {
      gsap.set(".hero-root", { opacity: 0 });

      gsap.set(".hero-bg", {
        opacity: 0,
        filter: "blur(6px) brightness(1)",
        scale: 0.97,
        transformOrigin: "center top",
      });

      gsap.set(".hero-reveal", {
        opacity: 0,
        y: 25,
        filter: "blur(12px)",
        scale: 0.96,
        transformOrigin: "center bottom",
      });

      gsap.set(".hero-cta", { opacity: 0, scale: 0.95 });

      const tl = gsap.timeline({
        paused: true,
        defaults: { overwrite: "auto" },
      });
      heroTlRef.current = tl;

      tl.to(".hero-root", { opacity: 1, duration: 0.3, ease: "none" })

        .to(".hero-bg", {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          scale: 1,
          duration: 0.4,
          ease: "power2.out",
        })

        .to(".hero-bg", {
          filter: "blur(0px) brightness(1.6)",
          duration: 0.125,
          ease: "power2.in",
        })

        .to(".hero-bg", {
          filter: "blur(0px) brightness(1)",
          duration: 0.125,
          ease: "power2.out",
        })

        .to(
          ".hero-reveal",
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            scale: 1,
            duration: 1.1,
            stagger: 0.1,
            ease: "power3.out",
          },
          "-=0.2",
        )

        .to(
          ".hero-cta",
          {
            opacity: 1,
            scale: 1,
            duration: 0.3,
            stagger: 0.06,
            ease: "back.out(1.5)",
          },
          "-=0.1",
        );
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef}>
      <div className="relative hero-root opacity-0 flex flex-col items-stretch pb-0 md:pb-12 mb-0 bg-[#0F0F0F]">
        <div className="relative hidden xl:block">
          <Image
            className="hero-bg w-full hidden md:block"
            src={"/images/hero/hero_img.webp"}
            width={1359}
            height={343}
            sizes="100vw"
            style={{ width: "100%", height: "auto" }}
            alt="hero-bg"
            priority
          />
          <div className="hero-reveal absolute right-4 xl:right-8.5 top-38 w-[36vw] max-w-[520px]">
            <AutumnConfig initialDelay={200} awaitEvent="preloader:complete" />
          </div>
        </div>

        <div className="flex flex-col gap-6 px-4 xl:px-22.75 py-8 bg-[#0F0F0F]">
          <h4 className="hero-reveal relative uppercase font-mono tracking-[-2%] text-[12px] md:text-sm leading-sm text-white md:text-[#FFFFFF99] bg-[#2c2c2d] w-fit p-2 min-h-[30px] md:min-h-[36px] flex items-center">
            <span className="invisible select-none" aria-hidden="true">
              {BADGE_TEXT}
            </span>
            <span className="absolute inset-0 flex items-center p-2">
              {displayedText}
            </span>
          </h4>
          <div className="flex flex-col gap-6 w-full px-0 lg:px-0">
            <h1 className="hero-reveal text-[44px] md:text-[56px] w-full max-w-sm sm:max-w-[480px] md:max-w-xl leading-[44px] tracking-[-5%] md:leading-14 font-sans">
              <span className="text-[#FFFFFF99] font-normal">
                The drop-in billing layer for
              </span>{" "}
              <span className="text-white block md:inline">AI startups</span>
            </h1>
            <p className="hero-reveal tracking-[-2%] w-full max-w-xs sm:max-w-[480px] md:max-w-xl text-[#FFFFFF99] md:text-[16px] text-[14px] font-light leading-5 font-sans">
              Stop rebuilding usage limits, credit systems, and subscription
              logic.{" "}
              <span className="text-white font-light">
                Autumn is the source of truth
              </span>{" "}
              that keeps webhooks, payments and usage perfectly in-sync.
            </p>
          </div>
        </div>

        <div className="border-t border-[#292929]" />
        <div className="flex flex-nowrap items-center xl:px-22.75 px-4 bg-[#0F0F0F] w-full overflow-hidden">
          {/* Primary CTA */}
          <div className="hero-cta w-full md:w-fit md:flex-shrink-0">
            <Link href={"https://app.useautumn.com/sign-in"}>
              <motion.div
                initial="initial"
                whileHover="hover"
                whileTap="hover"
                className="relative"
              >
                {/* Adjusted px-3 for mobile, md:px-4 for desktop */}
                <div className="relative overflow-hidden flex items-center gap-1.5 md:gap-2.5 cursor-pointer justify-between py-2 px-3 md:px-4 md:py-3.5 md:w-50 font-sans bg-[#9564ff] hover:bg-[#7D46F4] transition-colors duration-300">
                  <CTALines />
                  <span className="relative z-10 tracking-[-2%] uppercase md:normal-case text-white font-medium text-[12px] md:text-base whitespace-nowrap">
                    Start for free
                  </span>
                  <span className="relative z-10 scale-95 md:scale-100">
                    <IconCTAStart />
                  </span>
                </div>
              </motion.div>
            </Link>
          </div>

          {/* Secondary CTA */}
          <div className="hero-cta w-full md:w-fit md:flex-shrink-0">
            <Link href={"https://docs.useautumn.com/welcome"}>
              <motion.div
                initial="initial"
                whileHover="hover"
                whileTap="hover"
                className="relative"
              >
                <div className="relative overflow-hidden flex items-center gap-1.5 md:gap-2.5 border-r border-[#292929] text-white cursor-pointer justify-between py-2 px-3 md:px-4 md:py-3.5 md:w-50 font-sans bg-[#0F0F0F] hover:bg-[#FFFFFF1F] transition-colors duration-300">
                  <CTALines />
                  <span className="relative z-10 tracking-[-2%] text-[12px] uppercase md:normal-case md:text-[16px] whitespace-nowrap">
                    Read docs
                  </span>
                  <span className="relative z-10 scale-100">
                    <IconCTADocs />
                  </span>
                </div>
              </motion.div>
            </Link>
          </div>

          <div className="hero-cta hidden md:flex flex-nowrap gap-2 md:gap-3 ml-2 md:ml-3 h-10.5 md:h-12.5 flex-1">
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />

            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
            <div className="border-r border-[#292929] h-full hidden md:block" />
          </div>
        </div>
        <div className="border-b border-[#292929]" />
        {/* MOBILE VIEW*/}
        <div className="relative block xl:hidden w-full overflow-hidden  bg-[#0F0F0F] mt-12">
          <div className="relative overflow-hidden w-full p-7 flex items-center justify-center">
            <Image
              className="hero-bg absolute inset-0 w-full h-full object-cover"
              src="/images/hero/hero_mobile.webp"
              width={900}
              height={800}
              alt="hero-bg-mobile"
              priority
            />

            <div className="hero-reveal relative z-10 w-[96%] sm:w-[90%] max-w-[520px] flex justify-center items-center">
              {/* <AutumnConfig lines={16} initialDelay={1000} awaitEvent="preloader:complete" /> */}
              <Image
                src={"/images/hero/autumn_mobile.svg"}
                width={1600}
                height={1600}
                alt="xyz"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
