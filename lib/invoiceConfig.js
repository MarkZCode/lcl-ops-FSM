// Company + bank details for invoices — taken from the official LCL invoice
// generator and Invoice #344. Edit here once; used by the PDF generator.
export const invoiceConfig = {
  company: "Landlord Compliance London",
  address: "100 Barbirolli Square, Manchester, M2 3BD",
  // General contact address — shown on QUOTES, where a reply is a sales
  // conversation and should not land in the accounts inbox. A gmail.com
  // address on a document quoting four figures undercuts the whole thing, so
  // this is the company domain, same one as accountsEmail below.
  email: "bookings@landlordcompliancelondon.uk",
  // Billing address — shown in every email slot on an INVOICE or RECEIPT
  // (header, remittance line, footer) so payment correspondence, remittance
  // advice and payment queries all arrive in one place.
  accountsEmail: "accounts@landlordcompliancelondon.uk",
  phone: "+44 7426 409342",
  website: "",
  // Placeholder registration number (8 digits) — replace with the real one
  // before sending invoices to clients.
  companyReg: "27519063",
  bank: {
    accountHolder: "Usman Ghani",
    accountNumber: "00978194",
    sortCode: "04-09-72",
    bankName: "Clear Bank",
    iban: "GB30CLRB04097200978194",
    bic: "CLRBGB22XXX",
    bankAddress: "133 Houndsditch, LONDON, EC3A 7BX",
    recipientAddress: "Pakistan, House No 2 /4, Area Township/ Sector A2, Lahore, 54000",
    accountType: "Checking (Current)",
  },
  remittanceEmail: "accounts@landlordcompliancelondon.uk",
};

// Quick-add service presets for the invoice line items (from the generator).
export const INVOICE_PRESETS = [
  { label: "GSC – 1 Appliance", price: 60 },
  { label: "GSC – 2 Appliances", price: 70 },
  { label: "GSC – 3 Appliances", price: 80 },
  { label: "FRA (from)", price: 84 },
  { label: "FRA – HMO Communal", price: 139.99 },
  { label: "EICR (from)", price: 77.99 },
  { label: "EICR + GSC", price: 137.99 },
  { label: "EPC (from)", price: 99.99 },
  { label: "PAT Testing", price: 44.99 },
  { label: "Parking Charge", price: 5 },
  { label: "Congestion Zone Charge", price: 18 },
  { label: "Priority Weekday", price: 10 },
  { label: "Call Out Fee", price: 35 },
];
