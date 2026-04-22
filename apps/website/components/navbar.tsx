"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import {
	forwardRef,
	type MouseEvent,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
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
import type {
	PageStyle,
	PixelHoverHandle,
	PixelIconComponent,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { DashboardIconPixel } from "./dashboard-icon-pixel";

const NAV_LINKS = [
	{ label: "Docs", href: "https://docs.useautumn.com/welcome", Icon: IconDocs },
	{ label: "Blog", href: "/blog", Icon: IconBlog },
	{ label: "Pricing", href: "/#pricing", Icon: IconPricing },
	{
		label: "Discord",
		href: "https://discord.com/invite/STqxY92zuS",
		Icon: IconDiscord,
	},
];

const NavIconPixel = forwardRef<PixelHoverHandle, { Icon: PixelIconComponent }>(
	function NavIconPixel({ Icon }, ref) {
		const iconRef = useRef<SVGSVGElement | null>(null);
		const tlRef = useRef<gsap.core.Timeline | null>(null);

		useImperativeHandle(ref, () => ({
			restart: () => tlRef.current?.play(),
			reverse: () => tlRef.current?.reverse(),
		}));

		useEffect(() => {
			const pixelEls =
				iconRef.current?.querySelectorAll<SVGPathElement>(".icon-pixel-path");
			if (!pixelEls?.length) return;

			const pixels = Array.from(pixelEls).sort((a, b) => {
				const aBox = a.getBBox();
				const bBox = b.getBBox();
				return (
					aBox.x +
					aBox.width / 2 -
					(aBox.y + aBox.height / 2) -
					(bBox.x + bBox.width / 2 - (bBox.y + bBox.height / 2))
				);
			});

			gsap.set(pixels, {
				opacity: 0.15,
				scale: 0.8,
				transformOrigin: "left bottom",
				fill: "currentColor",
			});

			tlRef.current = gsap.timeline({ paused: true });

			tlRef.current
				.to(pixels, {
					opacity: 1,
					scale: 1.15,
					fill: "#FFFFFF",
					duration: 0.01,
					stagger: 0.025,
					ease: "power2.out",
				})
				.to(pixels, {
					scale: 1,
					duration: 0.01,
					ease: "back.out(3)",
				});

			return () => {
				tlRef.current?.kill();
			};
		}, []);

		return (
			<span className="group/icon relative inline-flex h-8 w-8 items-center justify-center">
				<div className="relative flex h-[16px] w-[16px] items-center justify-center">
					<Icon ref={iconRef} className="h-full w-full text-white" />
				</div>
			</span>
		);
	},
);
NavIconPixel.displayName = "NavIconPixel";

function NavLinkItem({ item }: { item: (typeof NAV_LINKS)[number] }) {
	const iconRef = useRef<PixelHoverHandle | null>(null);
	const isAnchor =
		item.href.startsWith("#") || item.href.startsWith("/#");

	const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
		if (!isAnchor) return;
		const hash = item.href.startsWith("/#")
			? item.href.slice(1)
			: item.href;
		const el = document.querySelector(hash);
		if (el) {
			e.preventDefault();
			const top = el.getBoundingClientRect().top + window.scrollY - 64;
			window.scrollTo({ top, behavior: "smooth" });
		}
	};

	return (
		<div className="nav-link">
			<Link
				href={item.href}
				onClick={handleClick}
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

export default function Navbar({
	animateIntro = true,
}: {
	animateIntro?: boolean;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dashboardIconRef = useRef<PixelHoverHandle | null>(null);
	const RECOIL_DELAY = 1000;
	const [recoilHidden, setRecoilHidden] = useState(false);
	const recoilTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
			if (recoilTimerRef.current) clearTimeout(recoilTimerRef.current);
			recoilTimerRef.current = setTimeout(
				() => setRecoilHidden(false),
				RECOIL_DELAY,
			);
		};
		window.addEventListener("elastic-recoil", onRecoil);
		return () => {
			window.removeEventListener("elastic-recoil", onRecoil);
			if (recoilTimerRef.current) clearTimeout(recoilTimerRef.current);
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
			if (!animateIntro) return;
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
		{ scope: containerRef, dependencies: [animateIntro] },
	);

	const mobileTl = useRef<gsap.core.Timeline | null>(null);

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
			style={
				{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
			}
			ref={containerRef}
		>
			<div className="absolute pointer-events-none left-0 border-t border-[#292929] w-screen z-50" />
			{scrolled && !recoilHidden && (
				<div className="h-[56px] md:h-[44px] w-fit" />
			)}

			<div
				className={cn(
					scrolled && !recoilHidden
						? "fixed top-0 left-0 z-80 w-full border-t border-b border-[#292929] bg-[#0F0F0F] px-4 pt-4 backdrop-blur-md md:px-(--page-pad)"
						: "relative",
				)}
			>
				{scrolled && !recoilHidden && (
					<>
						<div className="absolute pointer-events-none top-4 left-0 w-full border-t border-[#292929]" />
						<div className="absolute pointer-events-none left-4 md:left-(--page-pad) top-0 bottom-0 border-l border-[#292929]" />
						<div className="absolute pointer-events-none right-4 md:right-(--page-pad) top-0 bottom-0 border-r border-[#292929]" />
					</>
				)}
				<nav className="nav-root bg-[#0F0F0F] flex items-center justify-between font-mono uppercase text-xs pl-2 md:pl-0 h-[44px] md:h-[44px] lg:pb-0 xl:pb-0">
					<Link href={"/"}>
						<Image
							src="/images/navbar/autumnlogo.svg"
							width={114}
							height={28}
							alt="Autumn"
							priority
							className="nav-logo ml-2 block w-[90px] sm:w-[110px] lg:w-[114px] h-auto"
						/>
					</Link>

					<div className="hidden lg:flex items-center gap-6">
						{NAV_LINKS.map((item) => (
							<NavLinkItem key={item.label} item={item} />
						))}
					</div>

					<div className="nav-dashboard hidden lg:block">
						<motion.div
							initial="initial"
							whileHover="hover"
							whileTap={{ scale: 0.97 }}
							className="relative"
						>
							<Link
								href="https://app.useautumn.com"
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
						className="lg:hidden mr-2 p-1.5 text-[#FFFFFF99] cursor-pointer"
						onClick={() => setMenuOpen(!menuOpen)}
						whileTap={{ scale: 0.9 }}
						aria-label="Toggle menu"
					>
						<MenuGridIcon isOpen={menuOpen} />
					</motion.button>
				</nav>
			</div>
			<div
				className={cn(
					"fixed nav-mobile inset-x-0 z-40 flex h-[calc(100dvh-58px)] flex-col overflow-x-hidden overflow-y-auto bg-[#000000] px-4 pb-8 font-mono uppercase transition-all duration-300 md:px-(--page-pad) lg:top-5",
					scrolled && !recoilHidden
						? "top-[58px] sm:top-[60px]"
						: "top-[66px] sm:top-[62px]",
				)}
				style={{
					opacity: 0,
					pointerEvents: "none",
					clipPath: "inset(0% 0 100% 0)",
				}}
			>
				{/* Nav items */}
				<div className="flex flex-col">
					{NAV_LINKS.map((item) => {
					const isAnchor =
						item.href.startsWith("#") || item.href.startsWith("/#");
					const isExternal = item.href.startsWith("http");
					return (
						<Link
							key={item.label}
							href={item.href}
							target={isExternal ? "_blank" : undefined}
							onClick={
								isAnchor
									? (e) => {
											const hash = item.href.startsWith("/#")
												? item.href.slice(1)
												: item.href;
											const el = document.querySelector(hash);
											setMenuOpen(false);
											if (el) {
												e.preventDefault();
												const top =
													el.getBoundingClientRect().top +
													window.scrollY -
													64;
												window.scrollTo({ top, behavior: "smooth" });
											}
										}
									: undefined
							}
								className="flex items-center gap-4 px-4 py-3.5 border-b border-[#292929] active:bg-[#141414ea] text-[#ffffff99] hover:text-white active:text-white transition-colors text-sm tracking-[-1%]"
							>
								<item.Icon className="h-3.5 w-3.5 shrink-0" />
								<span>{item.label}</span>
							</Link>
						);
					})}
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

					<div className="border-b border-[#292929] py-1.5" />
					<div className="border-b border-[#292929] py-1.5" />
					<div className="border-b border-[#292929] py-1.5" />
				</div>
			</div>
			{!scrolled && (
				<div className="absolute pointer-events-none left-0 border-b border-[#292929] w-full z-50" />
			)}
		</div>
	);
}
