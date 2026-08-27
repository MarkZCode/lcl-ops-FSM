# LCL Ops - Data Import & Renewal Campaign Guide

This guide explains how to extract client data from screenshots and launch renewal campaigns.

## Overview

The workflow has three steps:

1. **Extract Data** — Run the Python scraper to pull data from 100+ screenshots
2. **Import into FSM** — Review and import the extracted data into LCL Ops
3. **Launch Campaigns** — Contact clients for service renewals

---

## Step 1: Extract Data from Screenshots

### Prerequisites

- **Python 3.8+** installed on your machine
- **Claude API key** from Anthropic (you have this)
- **Screenshots** of your jobs (from ServiceM8, your FSM, etc.)

### Setup

```bash
# Navigate to your project
cd /Users/macbookpro/Claude\ LCL\ Ops

# Set your API key (replace with your actual key)
export ANTHROPIC_API_KEY="sk-ant-..."

# Install dependencies
pip install -r scraper/requirements.txt
```

### Run the Scraper

```bash
# 1. Place all screenshots in the scraper/screenshots/ folder
#    (Create this folder if it doesn't exist)
mkdir -p scraper/screenshots

# 2. Copy your 100-300 screenshots there
cp /path/to/screenshots/* scraper/screenshots/

# 3. Run the scraper
python scraper/scraper.py
```

**Output:** A CSV file in `scraper/output/` named like `LCL_Jobs_Import_20250606_143022.csv`

### What Gets Extracted

From each screenshot, the scraper extracts:

- ✅ Client name & contact details (phone, email)
- ✅ Full address & postcode
- ✅ Services provided (EICR, GSC Appliances, etc.)
- ✅ Job status (Completed, Failed, Pending, etc.)
- ✅ Amount charged
- ✅ Invoice number
- ✅ Tenant details (if different from owner)
- ✅ Notes and job description

---

## Step 2: Import into LCL Ops

### Via Web App (Recommended)

1. Open **LCL Ops** in your browser
2. Go to **"Import & Renewals"** (new section in sidebar)
3. Click **"Choose CSV"** and select your output file
4. Review the preview table
5. Click **"Import All"**

LCL Ops will:
- ✅ Create new clients that don't already exist
- ✅ Match clients by name + phone number
- ✅ Add new jobs to existing clients
- ✅ Store in Supabase (if configured) or localStorage

---

## Step 3: Launch Renewal Campaigns

Once imported, you can reach out to clients for service renewals.

### In LCL Ops

1. After import, you're in the **Campaign Builder**
2. **Select clients** to contact (or select all)
3. **Customize message template** — Use placeholders:
   - `{name}` — Client name
   - `{services}` — Services they previously used
4. **Set campaign name** (e.g., "EICR Renewals Q2 2025")
5. **Launch** — Sends emails via your configured email system

### Email Template Example

```
Hi {name},

We wanted to reach out regarding your {services} service from last year.
It's time for your annual renewal!

Would you like to schedule a time for us to come out?

Best regards,
[Your Company]
```

---

## CSV Format Reference

If you're importing from another source, use this format:

| Field | Description | Example |
|-------|-------------|---------|
| client_name | Full name | John Smith |
| phone | Phone number | 07920257519 |
| email | Email address | john@example.com |
| address | Full address | Flat 63, Albany Mansions, Albert Bridge Road |
| postcode | Postal code | SW11 4PQ |
| services | Comma-separated services | EICR Testing, GSC Appliances |
| amount_charged | Amount in £ | 159.99 |
| job_status | Job status | Completed |
| job_date | Date (YYYY-MM-DD) | 2025-06-01 |
| invoice_number | Invoice ID | #6327 |
| tenant_name | Tenant name (optional) | Jane Smith |
| tenant_contact | Tenant contact (optional) | jane@example.com |
| notes | Additional notes | Failed EICR - remedial works needed |

---

## Troubleshooting

### "No images found in screenshots/"

**Problem:** Scraper can't find your images.

**Solution:**
```bash
# Make sure folder exists and has images
ls scraper/screenshots/

# Place images there
cp your_screenshots/* scraper/screenshots/
```

### "ANTHROPIC_API_KEY environment variable not set"

**Problem:** API key not configured.

**Solution:**
```bash
# Set it temporarily (for this session)
export ANTHROPIC_API_KEY="sk-ant-..."

# Or permanently in ~/.zshrc (for zsh) or ~/.bashrc (for bash)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc
```

### "Failed to parse JSON"

**Problem:** Scraper couldn't extract data from this screenshot.

**Solution:**
- Make sure the image clearly shows job details
- Check image quality isn't too blurry
- The scraper will skip failed images and continue with others
- You can manually enter data for failed images in LCL Ops

### "Email not sending"

**Problem:** Campaign emails not going out.

**Solution:**
1. Check **Settings → Email** in LCL Ops
2. Verify SMTP settings are configured
3. Check Gmail/provider requirements (2FA, app passwords, etc.)

---

## Advanced: Batch Processing 300+ Screenshots

For very large batches:

```bash
# Process in smaller batches (e.g., 50 at a time)
mkdir screenshots_batch1
cp screenshots/001-050* screenshots_batch1/
python scraper/scraper.py  # Change SCREENSHOTS_DIR to screenshots_batch1

# Repeat for batch2, batch3, etc.
# Then import all CSVs in LCL Ops one by one
```

---

## Cost Estimate

The scraper uses Claude's vision API. Rough costs:

- **$0.003** per screenshot (Claude Opus 4.8)
- **100 screenshots** = ~$0.30
- **300 screenshots** = ~$0.90
- **1000 screenshots** = ~$3.00

---

## Next Steps

1. ✅ Extract data from your screenshots (via scraper)
2. ✅ Import into LCL Ops
3. ✅ Build your client list
4. ✅ Create renewal campaigns
5. ✅ Track responses in LCL Ops

Once you have a clean client database, you can:
- Schedule regular automated reminders
- Track which clients responded
- Log new jobs from renewal calls
- Build service history per client

---

## Questions?

Check the **Help & Docs** section in LCL Ops for more.
