import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";

export const metadata = { title: "Not found — LCL Ops" };

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-6xl font-bold text-brand-500">404</span>
      <p className="text-navy-600">That page doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary">
        <FiArrowLeft /> Back to dashboard
      </Link>
    </div>
  );
}
