// Demo seed data so the app feels real on first load.
// In the local prototype this is loaded once into localStorage, then the user's
// edits persist. Swap this layer for a real DB/API later without touching the UI.

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export const seedClients = [
  {
    id: "cl-1",
    name: "Priya Sharma",
    company: "Sharma Lettings",
    email: "priya@sharmalettings.co.uk",
    phone: "07700 900111",
    type: "Landlord",
    properties: [
      { id: "pr-1", label: "Flat 4, 22 Camden High St", postcode: "NW1 7JE", area: "Camden", beds: 2 },
      { id: "pr-2", label: "14 Kentish Town Rd", postcode: "NW5 2AA", area: "Camden", beds: 3 },
    ],
    notes: "Prefers WhatsApp. Portfolio landlord, 6 units total.",
  },
  {
    id: "cl-2",
    name: "Daniel O'Connor",
    company: "Hackney Property Mgmt",
    email: "dan@hackneypm.co.uk",
    phone: "07700 900222",
    type: "Managing agent",
    properties: [
      { id: "pr-3", label: "Block A, Mare Street", postcode: "E8 3RH", area: "Hackney", beds: 0 },
    ],
    notes: "Manages communal areas for a 12-flat block. Needs FRA + emergency lighting annually.",
  },
  {
    id: "cl-3",
    name: "Helen Whitfield",
    company: "",
    email: "helen.whitfield@gmail.com",
    phone: "07700 900333",
    type: "Landlord",
    properties: [
      { id: "pr-4", label: "9 Northcote Rd", postcode: "SW11 1NT", area: "Wandsworth", beds: 1 },
    ],
    notes: "Single let. EICR due for renewal soon.",
  },
  {
    id: "cl-4",
    name: "Marco Ferretti",
    company: "Caffe Ferretti Ltd",
    email: "marco@caffeferretti.co.uk",
    phone: "07700 900444",
    type: "Commercial",
    properties: [
      { id: "pr-5", label: "Unit 3, Shoreditch High St", postcode: "E1 6JE", area: "Tower Hamlets", beds: 0 },
    ],
    notes: "Café. Commercial gas + EICR + FRA. Out-of-hours visits preferred.",
  },
];

export const seedJobs = [
  {
    id: "JOB-1042",
    clientId: "cl-1",
    propertyId: "pr-1",
    services: ["GAS", "EICR"],
    status: "scheduled",
    engineerId: "eng-3",
    scheduledAt: daysFromNow(1),
    price: 109.99,
    notes: "Tenant home after 10am. Combined gas + electrical visit.",
    createdAt: daysFromNow(-3),
    certExpiry: null,
  },
  {
    id: "JOB-1041",
    clientId: "cl-2",
    propertyId: "pr-3",
    services: ["FRA", "EMLIGHT"],
    status: "in_progress",
    engineerId: "eng-2",
    scheduledAt: daysFromNow(0),
    price: 124.99,
    notes: "Communal area assessment + emergency lighting test.",
    createdAt: daysFromNow(-5),
    certExpiry: null,
  },
  {
    id: "JOB-1040",
    clientId: "cl-3",
    propertyId: "pr-4",
    services: ["EICR"],
    status: "completed",
    engineerId: "eng-2",
    scheduledAt: daysFromNow(-2),
    price: 64.99,
    notes: "Satisfactory. Certificate issued.",
    createdAt: daysFromNow(-8),
    certExpiry: daysFromNow(40),
  },
  {
    id: "JOB-1039",
    clientId: "cl-4",
    propertyId: "pr-5",
    services: ["FRA", "GAS"],
    status: "invoiced",
    engineerId: "eng-3",
    scheduledAt: daysFromNow(-6),
    price: 199.98,
    notes: "Commercial café. Awaiting payment (BACS).",
    createdAt: daysFromNow(-12),
    certExpiry: daysFromNow(300),
  },
  {
    id: "JOB-1038",
    clientId: "cl-1",
    propertyId: "pr-2",
    services: ["GAS"],
    status: "paid",
    engineerId: "eng-1",
    scheduledAt: daysFromNow(-20),
    price: 45,
    notes: "Annual CP12. Paid by card.",
    createdAt: daysFromNow(-25),
    certExpiry: daysFromNow(20),
  },
  {
    id: "JOB-1043",
    clientId: "cl-3",
    propertyId: "pr-4",
    services: ["EPC"],
    status: "quote",
    engineerId: "unassigned",
    scheduledAt: null,
    price: 52,
    notes: "Quote requested via website form.",
    createdAt: daysFromNow(-1),
    certExpiry: null,
  },
  {
    id: "JOB-1037",
    clientId: "cl-2",
    propertyId: "pr-3",
    services: ["ALARM"],
    status: "paid",
    engineerId: "eng-1",
    scheduledAt: daysFromNow(-45),
    price: 55,
    notes: "Smoke/heat alarms across communal area.",
    createdAt: daysFromNow(-50),
    certExpiry: daysFromNow(-5),
  },
];
