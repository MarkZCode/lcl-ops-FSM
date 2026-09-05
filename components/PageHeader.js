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
export default function PageHeader({ title, subtitle, actions, icon: Icon, meta }) {
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
        className="page flex items-center justify-between gap-3 !py-4 sm:!py-6 lg:!pt-5"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-navy-200 sm:h-10 sm:w-10">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-400 dark:text-navy-500">
              Landlord Compliance London
            </p>
            <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight text-navy-900 sm:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-navy-500">{subtitle}</p>
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
  );
}
