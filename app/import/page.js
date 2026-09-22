"use client";

import { useState } from "react";
import { FiUpload, FiCheck, FiX, FiMail, FiDownload } from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";

export default function ImportPage() {
  const { addClient, addJob, clients } = useStore();
  const [step, setStep] = useState("upload"); // upload, preview, import, campaign
  const [csvData, setCsvData] = useState([]);
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMessage, setCampaignMessage] = useState(
    "Hi {name},\n\nWe wanted to reach out regarding your {services} service. It's time for your annual renewal!\n\nPlease reply if you'd like to schedule.\n\nBest regards"
  );
  const [campaignServices, setCampaignServices] = useState([]);

  // Parse CSV file
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split("\n").filter((l) => l.trim());
        const headers = lines[0].split(",").map((h) => h.trim());

        const data = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const row = {};
          headers.forEach((h, i) => {
            row[h] = values[i] || null;
          });
          return row;
        });

        setCsvData(data);
        setStep("preview");
        toast.success(`Loaded ${data.length} records from CSV`);
      } catch (error) {
        toast.error(`Failed to parse CSV: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Prepare data for import
  const prepareImportData = () => {
    const newClients = [];
    const newJobs = [];

    csvData.forEach((row) => {
      if (!row.client_name) return;

      // Check if client already exists
      const existingClient = clients.find(
        (c) =>
          c.name?.toLowerCase() === row.client_name?.toLowerCase() &&
          c.phone === row.phone
      );

      if (!existingClient) {
        // Create new client
        const clientId = `client-${Date.now()}-${Math.random()}`;
        newClients.push({
          id: clientId,
          name: row.client_name,
          email: row.email,
          phone: row.phone,
          type: "Residential", // Default type
          properties: [],
          address: row.address,
          postcode: row.postcode,
          tenantName: row.tenant_name,
          tenantContact: row.tenant_contact,
          importedAt: new Date().toISOString(),
        });
      }

      // Create job record
      const clientId =
        existingClient?.id ||
        newClients.find((c) => c.name === row.client_name)?.id;

      if (clientId) {
        const services = row.services
          ? row.services.split(";").map((s) => s.trim())
          : [];

        newJobs.push({
          id: `job-${Date.now()}-${Math.random()}`,
          clientId,
          title: services.join(", ") || "Service",
          status: row.job_status || "Completed",
          description: row.notes,
          date: row.job_date,
          amount: parseFloat(row.amount_charged) || 0,
          invoiceId: row.invoice_number,
          services,
          importSource: "csv_import",
          importedAt: new Date().toISOString(),
        });
      }
    });

    return { clients: newClients, jobs: newJobs };
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const { clients: newClients, jobs: newJobs } = prepareImportData();

      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token || "";
      const response = await fetch("/api/import-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clients: newClients,
          jobs: newJobs,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      // Also update local store
      newClients.forEach((c) => addClient(c));
      newJobs.forEach((j) => addJob(j));

      toast.success(
        `Imported ${newClients.length} clients and ${newJobs.length} jobs`
      );
      setStep("campaign");
    } catch (error) {
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleCampaignStart = () => {
    const selected = Array.from(selectedClients);
    if (selected.length === 0) {
      toast.error("Select at least one client");
      return;
    }
    setStep("campaign");
  };

  // Preview step
  if (step === "preview") {
    return (
      <>
        <PageHeader
          title="Import Preview"
          subtitle={`${csvData.length} records ready to import`}
        />

        <div className="p-4 sm:p-8">
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              <strong>Note:</strong> New clients will be created for records not
              matching existing clients by name + phone. Existing clients will
              have new jobs added.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-navy-200">
            <table className="w-full text-sm">
              <thead className="bg-navy-50">
                <tr>
                  <th className="border-b border-navy-200 px-4 py-2 text-left font-semibold text-navy-700">
                    Client
                  </th>
                  <th className="border-b border-navy-200 px-4 py-2 text-left font-semibold text-navy-700">
                    Phone
                  </th>
                  <th className="border-b border-navy-200 px-4 py-2 text-left font-semibold text-navy-700">
                    Email
                  </th>
                  <th className="border-b border-navy-200 px-4 py-2 text-left font-semibold text-navy-700">
                    Services
                  </th>
                  <th className="border-b border-navy-200 px-4 py-2 text-left font-semibold text-navy-700">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {csvData.map((row, idx) => (
                  <tr key={idx} className="border-b border-navy-100 hover:bg-navy-50">
                    <td className="px-4 py-2">{row.client_name}</td>
                    <td className="px-4 py-2 text-navy-600">{row.phone}</td>
                    <td className="px-4 py-2 text-navy-600">{row.email}</td>
                    <td className="px-4 py-2 text-sm">{row.services}</td>
                    <td className="px-4 py-2 font-semibold">{row.amount_charged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                setStep("upload");
                setCsvData([]);
              }}
            >
              <FiX /> Back
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleImport}
              disabled={importing}
            >
              <FiCheck />
              {importing ? "Importing..." : "Import All"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // Campaign step
  if (step === "campaign") {
    const { clients: newClients } = prepareImportData();

    return (
      <>
        <PageHeader title="Renewal Campaign" subtitle="Contact clients for service renewals" />

        <div className="p-4 sm:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Client selection */}
            <div className="card p-6">
              <h3 className="mb-4 font-bold text-navy-900">Select Clients</h3>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {newClients.map((client) => {
                  const isSelected = selectedClients.has(client.id);
                  return (
                    <label key={client.id} className="flex items-center gap-3 p-2 hover:bg-navy-50">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newSet = new Set(selectedClients);
                          if (e.target.checked) {
                            newSet.add(client.id);
                          } else {
                            newSet.delete(client.id);
                          }
                          setSelectedClients(newSet);
                        }}
                        className="cursor-pointer"
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-semibold text-navy-900">{client.name}</p>
                        <p className="text-navy-600">{client.email}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-navy-600">
                {selectedClients.size} of {newClients.length} selected
              </p>
            </div>

            {/* Campaign message */}
            <div className="card p-6">
              <h3 className="mb-4 font-bold text-navy-900">Campaign Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-2">
                    Campaign Name
                  </label>
                  <input
                    className="input"
                    placeholder="e.g., EICR Renewals Q2 2025"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-2">
                    Email Message
                  </label>
                  <textarea
                    className="input min-h-32"
                    placeholder="Message template..."
                    value={campaignMessage}
                    onChange={(e) => setCampaignMessage(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-navy-500">
                    Use {"{name}"} and {"{services}"} for dynamic content
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              className="btn-secondary"
              onClick={() => setStep("preview")}
            >
              <FiX /> Back
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              disabled={selectedClients.size === 0 || !campaignName}
              onClick={() => {
                // Save campaign draft
                toast.success(`Campaign "${campaignName}" created with ${selectedClients.size} clients`);
                setStep("upload");
                setCsvData([]);
              }}
            >
              <FiMail /> Launch Campaign
            </button>
          </div>
        </div>
      </>
    );
  }

  // Upload step
  return (
    <>
      <PageHeader
        title="Import Jobs & Clients"
        subtitle="Bulk import from CSV export or screenshot scraper"
        back={{ label: "Back" }}
      />

      <div className="p-4 sm:p-8">
        <div className="mx-auto max-w-3xl grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* CSV Upload */}
          <div className="card p-8 text-center">
            <div className="mb-4 inline-block rounded-lg bg-brand-100 p-4">
              <FiUpload className="text-2xl text-brand-600" />
            </div>
            <h3 className="mb-2 font-bold text-navy-900">Upload CSV</h3>
            <p className="mb-6 text-sm text-navy-600">
              From screenshot scraper or export
            </p>
            <label className="btn-secondary block cursor-pointer">
              Choose CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Screenshot Scraper Info */}
          <div className="card p-8">
            <div className="mb-4 inline-block rounded-lg bg-blue-100 p-4">
              <FiDownload className="text-2xl text-blue-600" />
            </div>
            <h3 className="mb-2 font-bold text-navy-900">Use Screenshot Scraper</h3>
            <p className="mb-4 text-sm text-navy-600">
              Install the Python scraper to extract data from ServiceM8 screenshots
            </p>
            <pre className="overflow-x-auto rounded bg-navy-50 p-3 text-xs">
              python scraper.py
            </pre>
            <p className="mt-4 text-xs text-navy-500">
              Output: ServiceM8_Jobs_*.csv
            </p>
          </div>
        </div>

        {/* Template Download */}
        <div className="mx-auto mt-8 max-w-3xl rounded-lg border-2 border-dashed border-navy-200 p-8 text-center">
          <p className="mb-4 text-sm text-navy-600">
            Need the CSV template? Download it to understand the required format.
          </p>
          <button className="btn-secondary">
            <FiDownload /> Download Template
          </button>
        </div>
      </div>
    </>
  );
}
