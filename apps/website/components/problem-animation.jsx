"use client";

const IMAGE_SOURCES = [
  "/images/issues/Slack.svg",
  "/images/issues/Frame%202147243001.svg",
  "/images/issues/Frame%202147242729.svg",
  "/images/issues/Slack-1.svg",
  "/images/issues/Frame%202147243134.svg",
  "/images/issues/Slack-2.svg",
  "/images/issues/Frame%202147243146.svg",
  "/images/issues/Stripe.svg",
];

const ITEM_COUNT = IMAGE_SOURCES.length;
const PAUSE_SECONDS = 2;
const SCROLL_SECONDS = 0.5;
const TOTAL_SECONDS = ITEM_COUNT * (PAUSE_SECONDS + SCROLL_SECONDS);

function buildKeyframes() {
  const stepPct = 100 / ITEM_COUNT;
  const pauseRatio = PAUSE_SECONDS / (PAUSE_SECONDS + SCROLL_SECONDS);
  const perItemTranslate = 50 / ITEM_COUNT;

  const frames = ["0% { transform: translateY(0); }"];

  for (let i = 0; i < ITEM_COUNT; i++) {
    const holdY = i * perItemTranslate;
    const nextY = (i + 1) * perItemTranslate;
    const pauseEndPct = (i * stepPct + stepPct * pauseRatio).toFixed(4);
    const stepEndPct = ((i + 1) * stepPct).toFixed(4);

    const holdTransform =
      holdY === 0 ? "translateY(0)" : `translateY(-${holdY.toFixed(4)}%)`;

    frames.push(`${pauseEndPct}% { transform: ${holdTransform}; }`);
    frames.push(
      `${stepEndPct}% { transform: translateY(-${nextY.toFixed(4)}%); }`,
    );
  }

  return frames.join("\n    ");
}

const keyframesCSS = buildKeyframes();

export default function ProblemAnimation() {
  return (
    <div className="relative w-full h-140 md:h-175 lg:h-175 xl:h-full bg-[#080808] overflow-hidden">
      <style>{`
        @keyframes carouselUp {
          ${keyframesCSS}
        }
      `}</style>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 z-10 bg-gradient-to-b from-[#080808] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 z-10 bg-gradient-to-t from-[#080808] to-transparent" />

      <div
        className="flex flex-col items-center will-change-transform"
        style={{
          animation: `carouselUp ${TOTAL_SECONDS}s ease-in-out infinite`,
        }}
      >
        {[...IMAGE_SOURCES, ...IMAGE_SOURCES].map((src, i) => (
          <div
            key={i}
            className="flex items-center justify-center shrink-0 w-full h-[80px] md:h-[140px]"
          >
            <img
              src={src}
              alt=""
              className="block max-h-full max-w-[90%] object-contain"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
