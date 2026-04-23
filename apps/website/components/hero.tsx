"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CTALines, IconCTADocs, IconCTAStart } from "@/app/constant";

// `AutumnConfig` pulls in `react-syntax-highlighter` + `highlight.js` (~100KB
// gzipped + meaningful parse cost on mobile). It only renders on `xl+`
// viewports, so keep it out of the critical path for mobile users entirely.
const AutumnConfig = dynamic(() => import("./autumn-config"), { ssr: false });

const BADGE_TEXT = "// 100% open source";

const getLoggedInHintCookie = () => {
	if (typeof window === "undefined") return null;
	return (
		document.cookie
			.split("; ")
			.find((row) => row.startsWith("logged_in_hint="))
			?.split("=")[1] === "1"
	);
};

export default function Hero() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	// Start with the final text so SSR/first paint shows "// 100% open source"
	// immediately. The typewriter effect only runs on fast desktop hydration
	// (it intentionally clears and re-scrambles this value); everywhere else
	// the initial text is left alone.
	const [displayedText, setDisplayedText] = useState(BADGE_TEXT);
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	// Gate the xl-only hero visual (background video + AutumnConfig syntax
	// highlighter) behind an actual viewport check so mobile never downloads
	// ~100KB of react-syntax-highlighter or 640KB of video that `hidden
	// xl:block` would otherwise still fetch.
	const [isXl, setIsXl] = useState(false);

	// Read the hint cookie after mount to avoid SSR/CSR hydration mismatch.
	useEffect(() => {
		setIsLoggedIn(getLoggedInHintCookie() === true);
	}, []);

	useEffect(() => {
		const mq = window.matchMedia("(min-width: 1280px)");
		const update = () => setIsXl(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);

	// Badge typewriter
	useEffect(() => {
		// Only run the typewriter scramble on fast desktop hydration. Initial
		// state is already `BADGE_TEXT`, so bailing here leaves the SSR-rendered
		// text in place. On mobile, tablets, or slow-hydration desktop this
		// avoids a jarring "full text -> empty -> scrambled in" flash that
		// fires many seconds after the page has already been visible.
		if (
			window.matchMedia("(max-width: 1023px)").matches ||
			performance.now() > 300
		) {
			return;
		}

		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*0123456789";
		let intervalId: ReturnType<typeof setInterval> | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

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
						if (intervalId) clearInterval(intervalId);
						setDisplayedText(BADGE_TEXT);
					}
				}, 30);
			}, 150);
		};

		startTypewriter();
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (intervalId) clearInterval(intervalId);
		};
	}, []);

	useGSAP(
		() => {
			// IMPORTANT: do NOT gate `.hero-root` behind opacity:0 here or in JSX.
			// GSAP ships in a code-split chunk, so if the class were `opacity-0`
			// by default the hero would stay invisible for the full duration of
			// the JS chunk download + parse + hydrate on mobile (~several seconds
			// on Slow 4G). We use `gsap.from()` tweens so the content is visible
			// by default and only animates if GSAP has loaded by first frame.

			// Skip the entrance animation on non-desktop viewports, or on any
			// device where hydration landed well after first paint. Running
			// `.from()` tweens late would visibly hide already-painted content
			// and animate it back in — a much worse UX than no animation.
			// Threshold is tight (300ms) so the flash never happens on slow
			// devices; only near-instant hydration earns the animation.
			if (
				window.matchMedia("(max-width: 1023px)").matches ||
				performance.now() > 300
			) {
				return;
			}

			const tl = gsap.timeline({
				defaults: { overwrite: "auto" },
			});

			tl.from(".hero-bg", {
				opacity: 0,
				filter: "blur(6px) brightness(1)",
				scale: 0.97,
				transformOrigin: "center top",
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

				.from(
					".hero-reveal",
					{
						opacity: 0,
						y: 25,
						filter: "blur(12px)",
						scale: 0.96,
						transformOrigin: "center bottom",
						duration: 1.1,
						stagger: 0.1,
						ease: "power3.out",
					},
					"-=0.2",
				)

				.from(
					".hero-cta",
					{
						opacity: 0,
						scale: 0.95,
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
			<div className="relative hero-root flex flex-col items-stretch pb-0 md:pb-12 mb-0 bg-[#0F0F0F]">
				<div className="flex justify-between">
					<div className="flex flex-col gap-6 px-4 xl:px-22.75 py-8 bg-[#0F0F0F] mt-26">
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
									Drop-in credits and billing for
								</span>{" "}
								<span className="text-white block md:inline">AI agents</span>
							</h1>
							<p className="hero-reveal tracking-[-2%] w-full max-w-xs sm:max-w-[480px] md:max-w-xl text-[#FFFFFF99] md:text-[16px] text-[14px] font-light leading-5 font-sans">
								Stop rebuilding usage limits, credit ledgers and payment logic.{" "}
								<span className="text-white font-light">
									Autumn is the customer database
								</span>{" "}
								that scales from your first user to your largest contract.
							</p>
						</div>
					</div>
					{/*
					  Keep the wrapper itself in the SSR HTML with `hidden xl:block`
					  so desktop gets the correct half-width hero layout from the
					  first paint (no post-hydration layout shift). Only the heavy
					  children (video + AutumnConfig) are client-gated on `isXl`
					  so mobile never downloads them, and desktop fills the
					  already-reserved space once it hydrates.
					*/}
					<div className="hero-reveal relative w-[50vw] max-w-[720px] min-h-[525px] p-16 py-0 mx-auto hidden xl:block">
						{isXl && (
							<>
								<div className="absolute inset-0 z-0 pointer-events-none">
									<video
										src="/images/pricing-models/pricingbg.webm"
										autoPlay
										loop
										muted
										playsInline
										className="absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-100"
									/>
								</div>
								<div className="relative z-10 translate-y-16 w-full flex justify-center">
									<AutumnConfig initialDelay={200} />
								</div>
							</>
						)}
					</div>
				</div>
				<div className="border-t border-[#292929]" />
				<div className="flex flex-nowrap items-center xl:px-22.75 px-4 bg-[#0F0F0F] w-full overflow-hidden">
					{/* Primary CTA */}
					<div className="hero-cta w-full md:w-fit md:flex-shrink-0">
						<Link
							href={
								isLoggedIn
									? "https://app.useautumn.com"
									: "https://app.useautumn.com/sign-in"
							}
						>
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
										{isLoggedIn ? "Dashboard" : "Start for free"}
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
						<Link href={"https://cal.com/ayrod"}>
							<motion.div
								initial="initial"
								whileHover="hover"
								whileTap="hover"
								className="relative"
							>
								<div className="relative overflow-hidden flex items-center gap-1.5 md:gap-2.5 border-r border-[#292929] text-white cursor-pointer justify-between py-2 px-3 md:px-4 md:py-3.5 md:w-50 font-sans bg-[#0F0F0F] hover:bg-[#FFFFFF1F] transition-colors duration-300">
									<CTALines />
									<span className="relative z-10 tracking-[-2%] text-[12px] uppercase md:normal-case md:text-[16px] whitespace-nowrap">
										Get a demo
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
						{/*
						  Mobile hero backdrop: a still frame of the desktop webm
						  baked into a 63KB webp. The full 625KB looping video
						  competes with the hero SVG + critical JS for bandwidth on
						  slow mobile radios, and because this sits behind the
						  dominant `autumn_mobile.svg` with `mix-blend-screen`, a
						  static frame reads virtually identically.
						*/}
						<Image
							src="/images/pricing-models/pricingbg-mobile.webp"
							alt=""
							aria-hidden="true"
							fill
							priority
							sizes="100vw"
							className="hero-bg absolute inset-0 w-full h-full object-cover mix-blend-screen opacity-100 pointer-events-none select-none"
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
