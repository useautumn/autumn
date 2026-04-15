"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  PRELOADER_LOGO_PATH,
  PRELOADER_LOGO_VIEWBOX,
  PreloaderLogo,
} from "@/app/constant";

export default function Preloader() {
  const wrapperRef = useRef(null);
  const logoWrapRef = useRef(null);
  const gridWrapRef = useRef(null);
  const blackCoverRef = useRef(null);
  const fallbackRef = useRef(null);
  const [done, setDone] = useState(false);

  if (typeof window !== "undefined") {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (fallbackRef.current) {
      fallbackRef.current.style.opacity = "0";
    }

    const preventScroll = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("wheel", preventScroll, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchmove", preventScroll, {
      passive: false,
      capture: true,
    });

    const wrapper = wrapperRef.current;
    const logoWrap = logoWrapRef.current;
    const gridWrap = gridWrapRef.current;
    const blackCover = blackCoverRef.current;

    gsap.set(gridWrap, {
      clipPath: "inset(0 100% 0 0)",
      willChange: "clip-path",
      force3D: true,
    });
    gsap.set(blackCover, { opacity: 0, willChange: "opacity" });

    const logoSvg = logoWrap.querySelector("svg");
    gsap.set(logoSvg, { opacity: 0 });

    const canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
    });
    wrapper.appendChild(canvas);

    const cleanup = () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      window.removeEventListener("wheel", preventScroll, { capture: true });
      window.removeEventListener("touchmove", preventScroll, {
        capture: true,
      });
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

    const runExitSequence = () => {
      const tl = gsap.timeline({ defaults: { overwrite: "auto" } });

      tl.to(canvas, { opacity: 0, duration: 0.35, ease: "power2.out" })
        .to(
          gridWrap,
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 0.35,
            ease: "power2.out",
            force3D: true,
          },
          "<",
        )
        .to(blackCover, {
          opacity: 1,
          duration: 0.45,
          ease: "power2.inOut",
        })
        .to(wrapper, {
          opacity: 0,
          duration: 0.45,
          ease: "power2.inOut",
          onStart: () => {
            window.dispatchEvent(new CustomEvent("preloader:complete"));
          },
          onComplete: () => {
            cleanup();
            setDone(true);
          },
        });
    };

    gsap.to(gridWrap, {
      clipPath: "inset(0 12% 0 0)",
      duration: 0.8,
      ease: "power2.in",
      force3D: true,
    });

    setTimeout(() => {
      const W = PRELOADER_LOGO_VIEWBOX.width;
      const H = PRELOADER_LOGO_VIEWBOX.height;

      const offscreen = document.createElement("canvas");
      offscreen.width = W;
      offscreen.height = H;
      const octx = offscreen.getContext("2d");
      const path2d = new Path2D(PRELOADER_LOGO_PATH);
      octx.fillStyle = "white";
      octx.fill(path2d);
      const { data } = octx.getImageData(0, 0, W, H);

      const dpr = window.devicePixelRatio || 1;
      const displayW =
        logoSvg.offsetWidth || logoSvg.getBoundingClientRect().width || 54;
      const displayH = Math.round((displayW / W) * H);
      const isMobile = displayW < 70;

      const STEP = isMobile ? 6 : 4;
      const DOT_R = isMobile
        ? Math.max(0.6, (displayW / W) * STEP * 0.3)
        : Math.max(1, (displayW / W) * STEP * 0.45);

      const dots = [];
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          if (data[i + 3] > 40) {
            dots.push({ nx: x / W, ny: y / H });
          }
        }
      }

      for (let i = dots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dots[i], dots[j]] = [dots[j], dots[i]];
      }

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      let painted = 0;
      const total = dots.length;
      const progress = { value: 0 };

      gsap.to(progress, {
        value: 1,
        duration: 1.05,
        ease: "power1.inOut",
        onUpdate() {
          const target = Math.floor(progress.value * total);
          while (painted < target) {
            const d = dots[painted];
            ctx.beginPath();
            ctx.arc(d.nx * displayW, d.ny * displayH, DOT_R, 0, Math.PI * 2);
            ctx.fillStyle = "#9564FF";
            ctx.fill();
            painted++;
          }
        },
        onComplete() {
          gsap.delayedCall(0.2, runExitSequence);
        },
      });
    }, 120);

    return () => {
      cleanup();
    };
  }, []);

  if (done) return null;

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[9999] bg-black"
      aria-hidden="true"
    >
      <div
        ref={fallbackRef}
        className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none transition-opacity duration-300"
      >
        <PreloaderLogo className="w-[53.57px] md:w-[97.94px] h-auto opacity-20" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div ref={logoWrapRef}>
          <PreloaderLogo className="w-[53.57px] md:w-[97.94px] h-auto" />
        </div>
      </div>

      <div ref={gridWrapRef} className="absolute bottom-0 left-0 w-full">
        <img
          src="/images/preloader/grid.png"
          width={1440}
          height={217}
          alt=""
          className="w-full h-auto"
        />
      </div>

      <div
        ref={blackCoverRef}
        className="absolute inset-0 bg-black pointer-events-none"
      />
    </div>
  );
}
