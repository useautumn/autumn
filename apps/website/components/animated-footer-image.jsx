"use client";

import Image from "next/image";

export default function AnimatedFooterImage() {
  return (
    <div className="fixed bottom-0 left-0 w-full z-0 pointer-events-none">
      {/* Mobile */}
      <Image
        src="/images/footer/maskedmobile.webp"
        alt="footer background"
        loading="lazy"
        width={0}
        height={0}
        sizes="100vw"
        className="block sm:hidden w-full h-auto"
      />

      {/* Desktop */}
      <Image
        src="/images/footer/maskedimage.webp"
        alt="footer background"
        width={0}
        height={0}
        sizes="100vw"
        loading="lazy"
        className="hidden sm:block w-full h-auto"
      />
    </div>
  );
}
