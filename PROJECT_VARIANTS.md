# Project Variants

This repository contains two variants of the JIT Access Management platform:

## 1. Governix (Root – Full-Featured)

**Location:** Root `/` (frontend/, backend/)

**Target:** Enterprise deployments with full cloud and feature support.

**Features:**
- **Multi-cloud:** AWS, Azure, GCP, Oracle Cloud
- **Database engines:** MySQL, PostgreSQL, MSSQL, MariaDB, Aurora, DocumentDB, Redshift, MongoDB Atlas
- **Other integrations:** EC2, S3, Lambda, JIRA, Splunk, ServiceNow, SIEM, ticketing
- **Admin panel:** Users, policies, features, security, integrations, reports
- **Full GovernAIX:** AI assistant, policy builder, guardrails, SCP management

## 2. Nykaa JIT (Limited Features)

**Location:** `nykaa-jit/` (nykaa-jit/frontend/, nykaa-jit/backend/)

**Target:** Simplified deployments with focused JIT database access.

**Features:**
- **AWS RDS:** MySQL, PostgreSQL, MSSQL, MariaDB, Aurora (engine-specific tabs)
- **Managed databases:** Basic support
- **DocumentDB, Redshift, MongoDB Atlas:** Limited
- **Streamlined UI:** Collapsed tree, single info banner, no Azure/Oracle
- **Terminal tabs:** Renamed to "Databases" and "Workloads"

**Excluded (vs Governix):**
- Azure, Oracle Cloud
- Many admin/integration features
- Some GovernAIX capabilities
