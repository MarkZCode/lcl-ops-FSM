"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { visibleUtilityLinks } from "@/lib/nav";
import NotificationBell from "./NotificationBell";
import LogoMark from "./LogoMark";
import GlobalSearch from "./GlobalSearch";

// Full-width application bar pinned above BOTH the sidebar and the content,
// which is what gives the reference layout its clean top edge — the rail
// starts underneath a single unbroken bar rather than beside a header that
// only spans the content column.
//
// Centre: global search. Right: a row of circular icon buttons.
export default function TopBar() {

  const pathname = usePathname();
  const { can, user } = useAuth();
  const utility = visibleUtilityLinks(can, user?.role);

  return (
    <header
      className="sticky top-0 z-30 hidden shrink-0 border-b border-navy-100 bg-navy-950/95 backdrop-blur lg:block"
      style={{ backgroundColor: "var(--surface-page)" }}
    >
      <div className="flex h-16 items-center gap-4 px-5">
        {/* Brand sits in the bar's left slot, which is rail-width so the
            search still centres over the content column. The header had no
            logo at all — the mark only appeared inside the rail, so a
            collapsed sidebar left the app unbranded entirely. */}
        {/* Full brand lockup — mark plus a two-line name. "LCL Ops" alone
            left most of the rail-width slot empty; the company line fills it
            and matches the wordmark on the invoices and emails. */}
        <Link href="/" className="flex w-[248px] shrink-0 items-center gap-3" aria-label="LCL Ops home">
          {/* `bg-white` is remapped to --surface-card per theme, so this tile
              is white in light and near-black in dark. The white SQUARE the
              logo used to look like in dark mode wasn't this tile at all — it
              was the opaque white background baked into the PNG, now keyed
              out. The hairline + shadow keep the tile readable in light mode,
              where white-on-#f6f6f7 otherwise disappears. */}
          {/* No tile. The mark is line art now (see LogoMark) and inherits
              the bar's own text colour, so boxing it in a white square just
              put a box inside a box. */}
          <LogoMark className="h-9 w-9 shrink-0 text-navy-900" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-semibold tracking-tight text-navy-900">LCL Ops</span>
            <span className="truncate text-[11px] text-navy-500">Landlord Compliance London</span>
          </span>
        </Link>

        <GlobalSearch className="mx-auto w-full max-w-xl" />

        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell />
          {/* EVERY utility link, not a slice. This was `.slice(0, 2)`, which
              rendered Clients and Engineers and silently dropped Settings —
              the page became unreachable from the desktop UI entirely. If a
              link is in the nav config it belongs here. */}
          {utility.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                title={it.label}
                aria-label={it.label}
                className={`grid h-9 w-9 place-items-center rounded-full border border-navy-200 transition-colors ${
                  active ? "bg-navy-100 text-navy-900" : "text-navy-500 hover:bg-navy-100 hover:text-navy-900"
                }`}
              >
                <Icon className="h-[17px] w-[17px]" />
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
