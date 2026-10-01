"use client";

// Adds the Congestion Zone Charge to a quote by itself when the property's
// postcode is inside the zone. Renders nothing.
//
// Runs once per job + postcode: the answer is remembered on the job
// (cczCheckedFor), so a charge someone deliberately takes off stays off, and
// changing the property's postcode makes it look again. Quotes only — a
// booked or billed job's price is never changed behind anyone's back.
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { getJobLines, isAddonCode, makeServiceLine, gbp } from "@/lib/format";
import { inCongestionZone } from "@/lib/quoteChecks";
import { toast } from "@/lib/toast";

const checkedOutside = new Set(); // postcodes already found to be outside, this session

export default function CongestionAuto({ job, property }) {
  const { updateJob, logActivity, catalog } = useStore();
  const pc = String(property?.postcode || "").replace(/\s/g, "").toUpperCase();

  useEffect(() => {
    if (!job || job.status !== "quote" || pc.length < 5) return;
    if (job.cczCheckedFor === pc || checkedOutside.has(pc)) return;
    const lines = getJobLines(job);
    if (!lines.some((l) => !isAddonCode(l.code))) return;
    let cancelled = false;
    inCongestionZone(property.postcode).then((inside) => {
      if (cancelled || inside == null) return;
      if (!inside) { checkedOutside.add(pc); return; }
      if (lines.some((l) => l.code === "CONGESTION")) {
        updateJob(job.id, { cczCheckedFor: pc });
        return;
      }
      const line = makeServiceLine("CONGESTION", `ln-CONGESTION-${Date.now().toString(36)}`);
      const fee = Number(catalog?.find((s) => s.code === "CONGESTION")?.price ?? line.unit) || 0;
      line.unit = fee;
      updateJob(job.id, {
        lineItems: [...lines, line],
        services: [...new Set([...(job.services || []), "CONGESTION"])],
        price: Math.round(((Number(job.price) || 0) + fee) * 100) / 100,
        cczCheckedFor: pc,
      });
      logActivity(job.id, { type: "note", title: `Congestion Zone Charge added automatically (${gbp(fee)})`, detail: `${property.postcode} is inside the congestion zone.`, by: "System" });
      toast(`${property.postcode} is in the congestion zone — ${gbp(fee)} charge added.`);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, job?.cczCheckedFor, pc]);

  return null;
}
