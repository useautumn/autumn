import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

export default function BlogLayout({ children }) {
  return (
    <div
      className="w-full overflow-x-clip"
      style={{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" }}
    >
      <div className="relative z-10 bg-[#0F0F0F] min-h-screen">
        <div className="relative w-full px-4 md:px-(--page-pad) pt-5">
          <div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
          <Navbar />
          <div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

          <div className="flex flex-col gap-2.5 mt-2.5">
            <div className="border-t border-[#292929] w-full" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
            <div className="border-t border-[#292929] w-full hidden md:block" />
          </div>

          {children}

          <Footer />
        </div>
      </div>
    </div>
  );
}
