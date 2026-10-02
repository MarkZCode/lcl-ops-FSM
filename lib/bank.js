// Which bank account an invoice asks to be paid into.
//
// There is more than one approved account, and which one goes on an invoice
// is chosen when the invoice is made. The choice sticks: the next invoice
// uses the same account until someone picks the other one. An invoice that
// has already gone out keeps the account it went out with (job.invoiceBankId),
// so the job page, the reminder emails and the statement all quote the
// account that is actually printed on that client's invoice.
//
// Accounts are managed in Settings → Bank accounts. The one in
// lib/invoiceConfig.js is the starting account, id "default".
import { invoiceConfig } from "./invoiceConfig";

export const DEFAULT_BANK_ACCOUNTS = [
  { id: "default", label: `${invoiceConfig.bank.accountHolder} · ${invoiceConfig.bank.bankName}`, ...invoiceConfig.bank },
];

export function pickBank(accounts, id) {
  const list = Array.isArray(accounts) && accounts.length ? accounts : DEFAULT_BANK_ACCOUNTS;
  return list.find((a) => a.id === id) || list[0];
}

// The account for a particular job: the one its invoice was made with, else
// whichever is currently selected.
export function bankForJob(job, accounts, activeId) {
  return pickBank(accounts, job?.invoiceBankId || activeId);
}

export const bankLabel = (a) => a?.label || [a?.accountHolder, a?.bankName].filter(Boolean).join(" · ") || "Bank account";
