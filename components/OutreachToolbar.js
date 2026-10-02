"use client";

// OutreachToolbar — Call / AI Call / Email / WhatsApp buttons for any contact.
// Used by Prospects, Agents, Leads, Recruits, Clients.
//
// Behaviour notes (informed by ops feedback):
//   • Email opens the in-app QuickEmailModal (NOT a native mailto:) so the
//     message is sent from landlordcompliancelondon@gmail.com — pass `onEmail`.
//   • WhatsApp pre-fills with a real sales/renewal message — pass `waMessage`
//     to override; otherwise we build a sensible default from contact context.
//   • The toolbar NEVER advances pipeline stage on click. Stage moves are an
//     explicit user action on the detail panel (per "shouldn't auto-bump
//     stage just because I clicked message" feedback).

import { FiPhone, FiPhoneCall, FiMail, FiMessageCircle } from "react-icons/fi";
import { waLink, allowOutreachWhatsApp } from "@/lib/whatsapp";

// Strip honorific titles (Mr / Mrs / Ms / Miss / Dr / Mx) before computing
// the first name. Without this, "Mr. Khan" rendered as "Hi Mr.," which felt
// robotic and immediately gave the outreach away.
function firstNameOf(rawName) {
  const tokens = (rawName || "").trim().split(/\s+/).filter(Boolean);
  const isTitle = (t) => /^(mr|mrs|ms|miss|mx|dr|prof|sir|rev)\.?$/i.test(t);
  const first = tokens.find((t) => !isTitle(t));
  // Skip single-letter initials too — "J Khan" → use "Khan", not "J"
  if (first && first.replace(/\./g, "").length === 1 && tokens.length > 1) {
    return tokens.slice(tokens.indexOf(first) + 1).find((t) => !isTitle(t)) || first;
  }
  return first || "";
}

function defaultWaMessage(contact, fromName = "Landlord Compliance London") {
  const first = firstNameOf(contact?.name);
  const greet = first ? `Hi ${first}` : "Hello";
  const service = contact?.service || "compliance certificate";
  const address = contact?.address ? ` for ${contact.address}` : "";
  const due = contact?.dueLabel ? ` (due ${contact.dueLabel})` : "";
  return (
    `${greet}, this is Lisa from ${fromName}.\n\n` +
    `I'm reaching out about your ${service}${address}${due}. ` +
    `We can usually book a same-day or next-day appointment and email the certificate over the same day too.\n\n` +
    `If you'd like a quote or want to book a slot, just reply here — happy to fit around the tenant if needed.`
  );
}

export default function OutreachToolbar({
  contact,
  onAiCall,
  onManualCall,
  onEmail,           // (contact) => open in-app email modal — preferred
  emailSubject,
  emailBody,
  waMessage,
  fromName,
  onChannelClick,    // (channel) => optional analytics/log hook — does NOT change stage
  compact = false,
  hideAiCall = false,
  contactLog = [],   // array of { channel, at, note }
}) {
  if (!contact) return null;
  const { phone, email } = contact;
  const size = compact ? "h-7 w-7" : "h-9 w-9";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  const mailto = email && !onEmail
    ? `mailto:${email}?${[
        emailSubject && `subject=${encodeURIComponent(emailSubject)}`,
        emailBody && `body=${encodeURIComponent(emailBody)}`,
      ].filter(Boolean).join("&")}`
    : null;

  const wa = phone ? waLink(phone, waMessage || defaultWaMessage(contact, fromName)) : null;

  // Determine completed channels
  const completed = {
    email: contactLog.some((l) => l.channel === "email"),
    call: contactLog.some((l) => l.channel === "call" || l.channel === "ai-call"),
    whatsapp: contactLog.some((l) => l.channel === "whatsapp"),
  };
  
  const completedCount = [completed.email, completed.call, completed.whatsapp].filter(Boolean).length;
  const totalChannels = 3;

  const Btn = ({ as: As = "button", title, onClick, href, target, color = "navy", isCompleted, children, ...rest }) => {
    const colorClass = isCompleted 
      ? "bg-green-600 hover:bg-green-700 text-white" 
      : (color === "brand" ? "bg-brand-600 hover:bg-brand-700 text-white" : "bg-navy-700 hover:bg-navy-800 text-white");
    const cls = `inline-flex items-center justify-center ${size} rounded-lg ${colorClass} shadow-sm transition-colors`;
    if (As === "a") return <a className={cls} href={href} target={target} title={title} onClick={onClick} {...rest}>{children}</a>;
    return <button type="button" className={cls} title={title} onClick={onClick} {...rest}>{children}</button>;
  };

  return (
    <div className="flex flex-col gap-1.5 items-center">
      <div className="inline-flex items-center gap-1.5">
        {phone && onManualCall && (
          <Btn title={`Call ${phone}`} color="brand" isCompleted={completed.call} onClick={() => { onManualCall(); onChannelClick?.("call"); }}>
            <FiPhone className={iconSize} />
          </Btn>
        )}
        {phone && !onManualCall && (
          <Btn as="a" href={`tel:${phone}`} title={`Call ${phone}`} color="brand" isCompleted={completed.call} onClick={() => onChannelClick?.("call")}>
            <FiPhone className={iconSize} />
          </Btn>
        )}
        {phone && !hideAiCall && onAiCall && (
          <Btn title="Start AI call" isCompleted={completed.call} onClick={() => { onAiCall(); onChannelClick?.("ai-call"); }}>
            <FiPhoneCall className={iconSize} />
          </Btn>
        )}
        {email && onEmail && (
          <Btn title={`Email ${email}`} isCompleted={completed.email} onClick={() => { onEmail(contact); onChannelClick?.("email"); }}>
            <FiMail className={iconSize} />
          </Btn>
        )}
        {email && !onEmail && (
          <Btn as="a" href={mailto} title={`Email ${email}`} isCompleted={completed.email} onClick={() => onChannelClick?.("email")}>
            <FiMail className={iconSize} />
          </Btn>
        )}
        {phone && (
          <Btn as="a" href={wa} target="_blank" rel="noreferrer" title="WhatsApp" isCompleted={completed.whatsapp} onClick={(e) => { if (!allowOutreachWhatsApp()) { e.preventDefault(); return; } onChannelClick?.("whatsapp"); }}>
            <FiMessageCircle className={iconSize} />
          </Btn>
        )}
      </div>
      
      {/* Progress Bar */}
      <div className="w-full flex flex-col gap-1">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
          <div 
            className={`h-full transition-all duration-300 ${completedCount === totalChannels ? 'bg-green-500' : 'bg-brand-500'}`} 
            style={{ width: `${(completedCount / totalChannels) * 100}%` }} 
          />
        </div>
        <div className="text-[9px] font-semibold tracking-wider text-navy-400 uppercase text-center">
          {completedCount === totalChannels ? "Done" : `${completedCount}/3 Done`}
        </div>
      </div>
    </div>
  );
}
