import LogoMark from "@/components/LogoMark";

export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy-900 px-6 text-center text-white">
      <div className="flex flex-col items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-lg dark:!bg-white">
          <LogoMark className="h-10 w-10" variant="light" />
        </span>
        <h1 className="text-xl font-black tracking-tight">You&rsquo;re offline</h1>
        <p className="max-w-xs text-sm text-white/60">
          LCL Ops can&apos;t reach the server right now. Check your connection
          and try again — pages you&apos;ve already opened may still work.
        </p>
        <a href="/" className="btn-primary mt-2">
          Try again
        </a>
      </div>
    </div>
  );
}
