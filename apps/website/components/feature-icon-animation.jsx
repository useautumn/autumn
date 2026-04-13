"use client";
import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import gsap from "gsap";

export const FeatureIconAnimation = forwardRef(({ Icon }, ref) => {
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
    play: () => tlRef.current?.play(),
    reverse: () => tlRef.current?.reverse(),
  }));

  useEffect(() => {
    const pixels = iconRef.current?.querySelectorAll("path");
    const pulseEl = pulseRef.current;
    if (!pixels || !pulseEl) return;

    // IDLE: Subjugated/Ghost state
    gsap.set(pixels, {
      opacity: 0.15,
      scale: 0.8,
      transformOrigin: "left bottom",
    });
    gsap.set(pulseEl, { opacity: 0 });

    tlRef.current = gsap.timeline({ paused: true });

    tlRef.current
      // SCRAMBLE
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
      // REVEAL
      .to(pulseEl, { opacity: 0, duration: 0.1, scale: 1.2 })
      .to(
        pixels,
        {
          opacity: 1,
          scale: 1.15,
          fill: "#9564ff", // Autumn Purple highlight for features
          duration: 0.2,
          stagger: {
            grid: [5, 5],
            from: [0, 4], // Bottom-Left Sweep
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
    <div className="relative flex items-center justify-center w-12 h-12 group/icon">
      {/* 5x5 Grid Mask */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="grid grid-cols-5 grid-rows-5 gap-[3px]">
          {Array.from({ length: 25 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/[0.08] w-[2.5px] h-[2.5px] rounded-[0.5px]"
            />
          ))}
        </div>
      </div>

      {/* Pulse Shuffle Layer */}
      <div
        ref={pulseRef}
        className="absolute z-20 font-mono text-[20px] text-[#9564ff] pointer-events-none select-none"
      >
        {"\u2800\u2836\u2800"}
      </div>

      {/* Feature Icon Layer */}
      <div className="relative z-10 w-[24px] h-[24px] flex items-center justify-center">
        <Icon ref={iconRef} className="w-full h-full text-white" />
      </div>
    </div>
  );
});
FeatureIconAnimation.displayName = "FeatureIconAnimation";
