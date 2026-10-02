"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";

// Page header. Sits directly below TopBar (desktop) or at the top of the
// screen (mobile).
//
// This used to be hard-coded for a DARK bar — `text-white` title, a
// `bg-white/10` icon tile, `text-white` icon. `.bar-navy` stopped being navy
// when the flat surface tokens landed: in light mode it resolves to
// --surface-card (white), so the title and the section icon were white on
// white and simply weren't there. Every page lost its heading and its icon in
// light mode, while the green breadcrumb and grey subtitle stayed visible —
// which is exactly how the bug looked. Colours now come from the same token
// classes the rest of the app uses (globals.css remaps navy-* per theme), so
// the header follows the theme instead of assuming one.
// On mobile with viewportFit:"cover" the header needs safe-area-inset-top padding
// so the title isn't hidden under the notch / Dynamic Island.
//
// `back`: pages that are a drill-down rather than a nav/tab destination
// (Summary, Inbox, Notifications, Email log, Import preview, …) pass this to
// get the same "← Back to X" affordance /jobs/[id] and /clients/[id] already
// had — those two just hard-coded their own Link instead of going through
// here, which is why every OTHER drill-down page never got one: there was
// nowhere shared to add it. `{ label }` alone uses router.back() (one screen
// back, whichever of Dashboard/Reports/etc. you actually came from — Summary
// opens from both); `{ href, label }` links to a fixed destination instead,
// for pages that only ever have one sensible parent.
function BackLink({ back }) {
  const router = useRouter();
  const label = back.label || "Back";
  const className = "mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200";
  if (back.href) {
    return (
      <Link href={back.href} className={className}>
        <FiArrowLeft /> {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      <FiArrowLeft /> {label}
    </button>
  );
}

export default function PageHeader({ title, subtitle, actions, icon: Icon, meta, back }) {
  return (
    <div className="bar-navy rule-brand relative">
      <div
        // Title and actions share a ROW on phones too. Stacking them cost a
        // whole button-height of vertical space at the top of every screen,
        // and on Jobs that pushed the first actual job below the fold behind
        // ~600px of header, search, toggle, period picker and status pills.
        // `page` here shares the container with the body below so the title,
        // the KPI row and the tables all line up on the same left edge. The
        // bar itself still spans the full width — only its contents are
        // constrained, which is what keeps the chrome looking continuous.
        className="page flex flex-col !py-4 sm:!py-6 lg:!pt-5"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        {back && <BackLink back={back} />}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {Icon && (
              <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-navy-200 sm:grid">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400 sm:block dark:text-navy-500">
                Landlord Compliance London
              </p>
              <h1 className="mt-0.5 truncate text-[28px] font-bold leading-tight tracking-[-0.02em] text-navy-900 sm:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 text-[13px] leading-snug text-navy-500 line-clamp-2 sm:truncate sm:text-sm">{subtitle}</p>
              )}
              {meta && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}
