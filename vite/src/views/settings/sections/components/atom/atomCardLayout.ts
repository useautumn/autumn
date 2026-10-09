import { TABLE_TRAY_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

/** A page card's chrome hangs 20px into the gutter, so everything inside it starts on the page's content column. */
export const ATOM_PAGE_CARD_CLASS = cn(TABLE_TRAY_CLASS, "sm:-mx-5");

/** A row on the tray: its border 1 + padding 4 + this 15 make up the 20px. */
export const ATOM_PAGE_CARD_TRAY_ROW_CLASS = "px-[15px]";

/** A cell on the raised surface: the surface's own border makes 14 up to 15. */
export const ATOM_PAGE_CARD_SURFACE_CELL_CLASS = "px-3.5";
