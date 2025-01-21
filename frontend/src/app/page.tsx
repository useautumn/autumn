import HomeView from "@/views/HomeView";
import HomeSidebar from "@/views/sidebar/Sidebar";
import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

enum AppEnv {
  Sandbox = "sandbox",
}

async function Home() {
  redirect("/customers");
  // const org = await currentOrganization();

  return (
    <div className="w-full h-full">{/* <HomeView /> */}</div>
    // <SidebarProvider>
    // </SidebarProvider>
  );
}

export default Home;
