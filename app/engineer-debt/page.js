"use client";

import PageHeader from "@/components/PageHeader";
import EngineerDebtTab from "@/components/EngineerDebtTab";
import RequirePermission from "@/components/RequirePermission";
import { LuScale } from "react-icons/lu";

export default function EngineerDebtPage() {
  return (
    <RequirePermission perm="engineers">
      <PageHeader
        icon={LuScale}
        title="Engineer Debt"
        subtitle="Track historical debts owed to engineers and record extra repayments independently from standard job payouts"
      />
      <div className="page">
        <EngineerDebtTab />
      </div>
    </RequirePermission>
  );
}
