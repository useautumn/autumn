import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";

import { TabButton } from "./TabButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCode,
  faFileLines,
  faToggleOff,
  faUsers,
} from "@fortawesome/pro-duotone-svg-icons";

import { Organization } from "@clerk/nextjs/server";
import { SidebarTop } from "./SidebarTop";
import { EnvDropdown } from "./EnvDropdown";
import { AppEnv } from "@autumn/shared";

import SidebarBottom from "./SidebarBottom";

function HomeSidebar({
  user,
  org,
  env,
}: {
  user: {
    first_name: string;
    email: string;
  };
  org: Organization;
  env: AppEnv;
}) {
  return (
    <Sidebar collapsible="icon" className=" bg-zinc-100">
      <SidebarTop orgName={org?.name || " "} env={env} />
      <SidebarContent>
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {<EnvDropdown env={env} />}

              <TabButton
                value="features"
                icon={<FontAwesomeIcon icon={faToggleOff} />}
                title="Features"
                env={env}
              />
              {/* <TabButton
                value="credits"
                icon={<FontAwesomeIcon icon={faBadgeDollar} />}
                title="Credits"
                env={env}
              /> */}
              <TabButton
                value="products"
                icon={<FontAwesomeIcon icon={faFileLines} />}
                title="Products"
                env={env}
              />
              <TabButton
                value="customers"
                icon={<FontAwesomeIcon icon={faUsers} />}
                title="Customers"
                env={env}
              />
              <TabButton
                value="dev"
                icon={<FontAwesomeIcon icon={faCode} />}
                title="Developer"
                env={env}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarBottom
        userName={user?.first_name || " "}
        userEmail={user?.email || " "}
        env={env}
      />
    </Sidebar>
  );
}

export default HomeSidebar;
