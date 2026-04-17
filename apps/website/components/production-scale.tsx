"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import { useEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger);

const SCRAMBLE_CHARS =
	"!@#$%^&*()_+-=[]{}|;:,.<>?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function scrambleText(
	el: HTMLElement,
	finalText: string,
	{ charDuration = 60, cycleSpeed = 30 } = {},
) {
	const len = finalText.length;
	let settled = 0;
	const timeouts: Array<ReturnType<typeof setTimeout>> = [];

	const cycleInterval = setInterval(() => {
		const display = finalText
			.split("")
			.map((ch, i) =>
				i < settled
					? ch
					: SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
			)
			.join("");
		el.textContent = display;
	}, cycleSpeed);

	for (let i = 0; i < len; i++) {
		const t = setTimeout(
			() => {
				settled = i + 1;
				if (settled === len) {
					clearInterval(cycleInterval);
					el.textContent = finalText;
				}
			},
			(i + 1) * charDuration,
		);
		timeouts.push(t);
	}

	return function cleanup() {
		clearInterval(cycleInterval);
		timeouts.forEach(clearTimeout);
		el.textContent = finalText;
	};
}

const cards = [
	{
		bg: "#A175FF",
		icon: "/images/production/uptime2.svg",
		metric: "1 Billion +",
		label: "Monthly events",
		description:
			"Autumn handles billions of billing events monthly for some of your favorite apps.",
		clipart: true,
	},
	{
		bg: "#FFE8FA",
		icon: "/images/production/latency.svg",
		metric: "<50ms",
		label: "US latency",
		description:
			"Every billing check resolves in under 50ms. Your users never wait for a gate.",
		clipart: true,
	},
	{
		bg: "#D698FF",
		icon: "/images/production/uptiime.svg",
		metric: "10 minutes",
		label: "Support SLA",
		description:
			"Billing is critical. We're loved for our rapid response times.",
		clipart: true,
	},
	{
		bg: "#F55DD0",
		icon: "/images/production/churn.svg",
		metric: "Zero",
		label: "Churn rate",
		description: "Unless their company shuts down, our customers stay with us.",
		clipart: true,
	},
];

export default function ProductionScale() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const scrambleCleanups = useRef<Array<() => void>>([]);

	useEffect(() => {
		const cleanups = scrambleCleanups.current;
		return () => {
			cleanups.forEach((fn) => fn());
		};
	}, []);

	useGSAP(
		() => {
			const isMobile = window.innerWidth < 768;
			const cardY = isMobile ? 16 : 30;

			gsap.set(".ps-card", { opacity: 0, y: cardY, scale: 0.97 });

			const tl = gsap.timeline({
				scrollTrigger: {
					trigger: ".ps-section",
					start: "top 75%",
				},
				defaults: { overwrite: "auto" },
			});

			const cardEls = gsap.utils.toArray<HTMLElement>(".ps-card");
			cardEls.forEach((card, i) => {
				tl.to(
					card,
					{
						opacity: 1,
						y: 0,
						scale: 1,
						duration: 0.9,
						ease: "power3.out",
						onComplete() {
							const metricEl = card.querySelector<HTMLElement>(".ps-metric");
							if (!metricEl) return;
							const finalText = metricEl.dataset.final;
							if (!finalText) return;
							const delayTimer = setTimeout(() => {
								const cleanup = scrambleText(metricEl, finalText);
								scrambleCleanups.current.push(cleanup);
							}, 200);

							scrambleCleanups.current.push(() => clearTimeout(delayTimer));
						},
					},
					0.3 + i * 0.15,
				);
			});
		},
		{ scope: containerRef },
	);

	return (
		<div ref={containerRef} className="overflow-hidden">
			<section className="ps-section flex flex-col lg:flex-row items-start justify-between py-12 lg:py-16 gap-12 lg:gap-0 bg-[#0F0F0F]">
				<div className="flex px-4 xl:pl-22.5 lg:pr-0 flex-col my-auto gap-4 lg:gap-6 pt-2 w-full lg:w-auto">
					<div className="leading-none lg:leading-10">
						<p className="text-[#FFFFFF99] tracking-[-4%] text-[30px] lg:text-[40px] font-normal">
							You're in
						</p>
						<h2 className="text-white tracking-[-4%] text-[30px] lg:text-[40px] font-normal mt-1 lg:mt-0">
							good hands
						</h2>
					</div>
					<p className="text-[#FFFFFF99] font-light text-[16px] lg:text-sm lg:w-sm leading-[20px] lg:leading-5">
						Autumn is trusted by some of fastest-growing teams. Open source
						core, self-host ready.{" "}
						<span className="text-white">
							We'll help you go live quickly
							<br className="hidden lg:block" /> and get back to what's
							important.
						</span>
					</p>
				</div>

				<div className="flex flex-col items-end gap-3 lg:gap-4 w-full pl-6 lg:pl-0 lg:w-[50%] [--card-step:24px] lg:[--card-step:52px]">
					{cards.map((card, i) => (
						<div
							key={card.metric}
							className="ps-card relative flex items-center justify-between pl-4 pr-3 py-4 lg:pl-6 lg:pr-10 lg:py-3.5 gap-2 lg:gap-6"
							style={{
								width: `calc(100% - (var(--card-step) * ${i}))`,
								backgroundColor: card.bg,
							}}
						>
							<div className="flex flex-col gap-1 min-w-[95px] lg:min-w-auto shrink-0">
								<div className="flex items-center gap-1.5 lg:gap-2">
									<Image
										src={card.icon}
										width={18}
										height={18}
										alt={card.label}
										className="w-[14px] h-[14px] lg:w-[18px] lg:h-[18px]"
									/>
									<span
										className="ps-metric text-xl lg:text-2xl font-medium tracking-[-5%] text-[#1A0A2E]"
										data-final={card.metric}
									>
										{card.metric}
									</span>
								</div>
								<span className="text-[11px] lg:text-[14px] leading-[1] lg:leading-4.5 tracking-[-2%] font-normal text-[#1A0A2E]/60">
									{card.label}
								</span>
							</div>

							<p className="text-[10.5px] lg:text-[14px] text-[#1A0A2E]/80 font-normal leading-[1.3] lg:leading-4.5 tracking-[0] lg:tracking-[-2%] flex-1 lg:flex-none lg:w-66 lg:shrink-0 text-left">
								{card.description}
							</p>

							{card.clipart && (
								<Image
									src="/images/production/clipart.svg"
									width={12}
									height={12}
									alt=""
									role="presentation"
									className="absolute bottom-0 right-0 max-lg:w-[8px] max-lg:h-[8px]"
								/>
							)}
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
