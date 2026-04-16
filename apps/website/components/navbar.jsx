"use client";

import {
  CTALines,
  IconBlog,
  IconCTAStart,
  IconDashboard,
  IconDiscord,
  IconDocs,
  IconPricing,
  MenuGridIcon,
} from "@/app/constant";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { DashboardIconPixel } from "./dashboard-icon-pixel";

const NAV_LINKS = [
  {
    label: "Discord",
    href: "https://discord.com/invite/STqxY92zuS",
    Icon: IconDiscord,
  },
  { label: "Blog", href: "https://useautumn.com/blog", Icon: IconBlog },
  { label: "Docs", href: "https://docs.useautumn.com/welcome", Icon: IconDocs },
  { label: "Pricing", href: "#", Icon: IconPricing },
];

const NavIconPixel = forwardRef(function NavIconPixel({ Icon }, ref) {
  const iconRef = useRef(null);
  const pulseRef = useRef(null);
  const tlRef = useRef(null);

  const frames = [
    "\u2800\u2836\u2800",
    "\u2830\u28FF\u2806",
    "\u28BE\u28C9\u2877",
    "\u28CF\u2800\u28F9",
    "\u2841\u2800\u2888",
  ];

  useImperativeHandle(ref, () => ({
    restart: () => {
      tlRef.current?.play();
    },
    reverse: () => {
      tlRef.current?.reverse();
    },
  }));

  useEffect(() => {
    const pixels = iconRef.current?.querySelectorAll(".icon-pixel-path");
    const pulseEl = pulseRef.current;
    if (!pixels || !pulseEl) return;

    gsap.set(pixels, {
      opacity: 0.15,
      scale: 0.8,
      transformOrigin: "left bottom",
      fill: "currentColor",
    });
    gsap.set(pulseEl, { opacity: 0 });

    tlRef.current = gsap.timeline({ paused: true });

    tlRef.current
      .to(pixels, { opacity: 0, duration: 0.05 })
      .to(pulseEl, { opacity: 1, duration: 0.05 }, "<")
      .to(pulseEl, {
        duration: 0.3,
        onUpdate: function () {
          const frameIndex = Math.floor(this.progress() * (frames.length - 1));
          pulseEl.innerText = frames[frameIndex];
        },
        ease: "none",
      })
      // 3. REVEAL: Pulse fades, SVG Icon sweeps in from bottom-left
      .to(pulseEl, { opacity: 0, duration: 0.1, scale: 1.2 })
      .to(
        pixels,
        {
          opacity: 1,
          scale: 1.15,
          fill: "#FFFFFF",
          duration: 0.2,
          stagger: {
            grid: [5, 5],
            from: [0, 4], // Bottom-Left scan
            amount: 0.25,
          },
          ease: "power2.out",
        },
        "-=0.1",
      )
      .to(pixels, {
        scale: 1,
        duration: 0.15,
        ease: "back.out(3)",
      });

    return () => tlRef.current?.kill();
  }, []);

  return (
    <span className="relative inline-flex items-center justify-center w-8 h-8 group/icon">
      {/* BACKGROUND MASK: Static field dots */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="grid grid-cols-5 grid-rows-5 gap-[3px]">
          {Array.from({ length: 25 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/[0.08] w-[1px] h-[1px] rounded-[0.5px]"
            />
          ))}
        </div>
      </div>

      {/* BRAILLE PULSE LAYER */}
      <div
        ref={pulseRef}
        className="absolute z-20 font-mono text-[16px] text-white pointer-events-none select-none"
      >
        {"\u2800\u2836\u2800"}
      </div>

      {/* SVG ICON LAYER (Idle: Faded / Hover: Solid) */}
      <div className="relative z-10 w-[16px] h-[16px] flex items-center justify-center">
        <Icon ref={iconRef} className="w-full h-full text-white" />
      </div>
    </span>
  );
});

function NavLinkItem({ item }) {
  const iconRef = useRef(null);
  return (
    <div className="nav-link">
      <Link
        href={item.href}
        className="group inline-flex items-center py-2 text-[#FFFFFF99] hover:text-white transition-colors"
        onMouseEnter={() => iconRef.current?.restart()}
        onMouseLeave={() => iconRef.current?.reverse()}
      >
        <NavIconPixel Icon={item.Icon} ref={iconRef} />
        <span className="font-mono text-[14px] uppercase tracking-widest transition-colors group-hover:text-white">
          {item.label}
        </span>
      </Link>
    </div>
  );
}

export default function Navbar() {
  const containerRef = useRef(null);
  const dashboardIconRef = useRef(null);
  const RECOIL_DELAY = 1000;
  const [recoilHidden, setRecoilHidden] = useState(false);
  const recoilTimerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const onRecoil = () => {
      setRecoilHidden(true);
      clearTimeout(recoilTimerRef.current);
      recoilTimerRef.current = setTimeout(
        () => setRecoilHidden(false),
        RECOIL_DELAY,
      );
    };
    window.addEventListener("elastic-recoil", onRecoil);
    return () => {
      window.removeEventListener("elastic-recoil", onRecoil);
      clearTimeout(recoilTimerRef.current);
    };
  }, []);

  // Lock body scroll while mobile menu is open
  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useGSAP(
    () => {
      gsap.set(".nav-root", { opacity: 0 });
      gsap.set(".nav-logo", {
        opacity: 0,
        filter: "blur(6px) brightness(1)",
        scale: 0.92,
        transformOrigin: "left center",
      });
      gsap.set(".nav-link", { opacity: 0, y: -8 });
      gsap.set(".nav-dashboard", { opacity: 0, scale: 0.95 });

      const tl = gsap.timeline({ defaults: { overwrite: "auto" } });

      tl.to(".nav-root", { opacity: 1, duration: 0.3, ease: "none" })
        .to(".nav-logo", {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          scale: 1,
          duration: 0.7,
          ease: "power2.out",
        })
        .to(".nav-logo", {
          filter: "blur(0px) brightness(1.6)",
          duration: 0.225,
          ease: "power2.in",
        })
        .to(".nav-logo", {
          filter: "blur(0px) brightness(1)",
          duration: 0.125,
          ease: "power2.out",
        })
        .to(
          ".nav-link",
          {
            opacity: 1,
            y: 0,
            duration: 0.25,
            stagger: 0.06,
            ease: "power2.out",
          },
          "-=0.05",
        )
        .to(
          ".nav-dashboard",
          {
            opacity: 1,
            scale: 1,
            duration: 0.3,
            ease: "back.out(1.5)",
          },
          "-=0.1",
        );
    },
    { scope: containerRef },
  );

  const mobileTl = useRef(null);

  useGSAP(
    () => {
      gsap.set(".nav-mobile", {
        opacity: 0,
        clipPath: "inset(0% 0 100% 0)",
        pointerEvents: "none",
      });

      gsap.set(
        ".nav-mobile a, .nav-mobile img, .nav-mobile button, .nav-mobile .border-b",
        {
          opacity: 0,
          filter: "blur(8px)",
          scale: 0.95,
        },
      );

      mobileTl.current = gsap.timeline({
        paused: true,
        defaults: { overwrite: "auto" },
      });

      mobileTl.current
        .to(".nav-mobile", {
          opacity: 1,
          y: 0,
          pointerEvents: "auto",
          clipPath: "inset(0% 0 0% 0)",
          duration: 0.65,
          ease: "power3.inOut",
        })
        .to(
          ".nav-mobile a, .nav-mobile img, .nav-mobile button, .nav-mobile .border-b",
          {
            opacity: 1,
            filter: "blur(0px)",
            scale: 1,
            duration: 0.4,
            stagger: 0.02,
            ease: "power2.out",
          },
          "-=0.35",
        );
    },
    { scope: containerRef },
  );

  useGSAP(
    () => {
      if (mobileTl.current) {
        if (menuOpen) {
          mobileTl.current.timeScale(1).play();
        } else {
          mobileTl.current.timeScale(1.8).reverse();
        }
      }
    },
    { scope: containerRef, dependencies: [menuOpen] },
  );

  return (
    <div
      style={{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" }}
      ref={containerRef}
    >
      <div className="absolute pointer-events-none left-0 border-t border-[#292929] w-screen z-50" />
      {scrolled && !recoilHidden && (
        <div className="h-[56px] md:h-[44px] w-fit" />
      )}

      <div
        className={`${scrolled && !recoilHidden
          ? "fixed top-0 left-0 z-80 w-full px-4 md:px-(--page-pad) bg-[#0F0F0F] backdrop-blur-md border-b border-t pt-4 border-[#292929]"
          : "relative"
          }`}
      >
        {scrolled && !recoilHidden && (
          <>
            <div className="absolute pointer-events-none top-4 left-0 w-full border-t border-[#292929]" />
            <div className="absolute pointer-events-none left-4 md:left-(--page-pad) top-0 bottom-0 border-l border-[#292929]" />
            <div className="absolute pointer-events-none right-4 md:right-(--page-pad) top-0 bottom-0 border-r border-[#292929]" />
          </>
        )}
        <nav className="nav-root bg-[#0F0F0F] flex items-center justify-between font-mono uppercase text-xs pl-2 pt-2.5 lg:py-0 xl:py-0 pb-2.5 lg:pb-0 xl:pb-0">
          <Link href={"/"}>
            <Image
              src="/images/navbar/autumnlogo.svg"
              width={114}
              height={28}
              alt="Autumn"
              loading="lazy"
              className="nav-logo ml-2 block w-[90px] sm:w-[110px] lg:w-[114px] h-auto"
            />
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((item) => (
              <NavLinkItem key={item.label} item={item} />
            ))}
          </div>

          <div className="nav-dashboard hidden md:block">
            <motion.div
              initial="initial"
              whileHover="hover"
              whileTap={{ scale: 0.97 }}
              className="relative"
            >
              <Link
                href="https://useautumn.com"
                target="_blank"
                className="relative overflow-hidden inline-flex items-center gap-2 bg-[#9564ff] hover:bg-[#7D46F4] active:bg-[#7D46F4] transition-colors duration-300 px-4 py-3.5 text-white cursor-pointer whitespace-nowrap"
                onMouseEnter={() => dashboardIconRef.current?.restart()}
                onMouseLeave={() => dashboardIconRef.current?.reverse()}
              >
                <CTALines />
                <div className="relative z-10 flex items-center gap-2">
                  <DashboardIconPixel
                    Icon={IconDashboard}
                    ref={dashboardIconRef}
                  />
                  <span className="font-sans font-medium tracking-tight">
                    Dashboard
                  </span>
                </div>
              </Link>
            </motion.div>
          </div>

          <motion.button
            className="md:hidden mr-2 p-1.5 text-[#FFFFFF99] cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
            whileTap={{ scale: 0.9 }}
            aria-label="Toggle menu"
          >
            <MenuGridIcon isOpen={menuOpen} />
          </motion.button>
        </nav>
      </div>
      <div
        className={`fixed w-full nav-mobile left-0 overflow-y-auto bg-[#000000] flex flex-col font-mono uppercase ${scrolled && !recoilHidden ? "top-[62px] sm:top-[60px]" : "top-[66px] sm:top-[62px]"} md:top-5 h-[calc(100dvh-58px)] z-40 px-4 pb-8 transition-all duration-300`}
        style={{ opacity: 0, pointerEvents: "none", clipPath: "inset(0% 0 100% 0)" }}
      >
        {/* Nav items */}
        <div className="flex flex-col">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              target="_blank"
              className="flex items-center gap-4 px-4 py-3.5 border-b border-[#292929] active:bg-[#141414ea] text-[#ffffff99] hover:text-white active:text-white transition-colors text-sm tracking-[-1%]"
            >
              <item.Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-col mt-auto -mb-2.5">
          <div className="border-t border-[#292929] py-1.5" />
          <div className="px-4">
            <Link
              href="https://useautumn.com"
              target="_blank"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between gap-4 px-2 py-2.5 bg-[#9564ff] active:bg-[#7D46F4] transition-colors duration-300 text-white text-sm tracking-widest"
            >
              <span className="tracking-[-2%] text-sm">Start for free</span>
              <IconCTAStart className="h-3.5 w-3.5" />
            </Link>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-[#292929] py-1.5" />
          ))}
        </div>
      </div>
      {!scrolled && (
        <div className="absolute pointer-events-none left-0 border-b border-[#292929] w-full z-50" />
      )}
    </div>
  );
}
