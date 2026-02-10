# Logos & Icons

This folder holds logo images used in the JIT Access Portal.

## Current files (use these)

| File        | Used for                |
|------------|-------------------------|
| `aws.png`  | AWS, EC2 Instances      |
| `azure.png`| Azure                   |
| `gcp.png`  | GCP, Google Cloud, GCS  |
| `gcs.png`  | Google Cloud Storage    |
| `oracle.png`| Oracle Cloud           |
| `s3.png`   | S3 Explorer             |
| `rds.png`  | RDS / Databases         |
| `kubernetes.png` | Containers / K8s   |
| `docker.png`     | Docker             |
| `jira.png`       | JIRA              |
| `servicenow.png` | ServiceNow        |
| `slack.png`      | Slack             |
| `siem.png`       | SIEM / Chronicle  |

## Adding more logos

1. **Download** the official logo (PNG with transparent background, around 128–256px).
2. **Save** it here with a clear name, e.g. `mongodb.png`, `mysql.png`, `postgresql.png`.
3. **Use in HTML** with:
   - Sidebar: `<img src="assets/logos/mongodb.png" alt="" class="nav-logo">`
   - Page title: `<img src="assets/logos/mongodb.png" alt="" class="page-title-logo">`
   - Cards: `<img src="assets/logos/mongodb.png" alt="MongoDB" class="card-logo">`

## Suggested sources

- [Official brand assets](https://worldvectorlogo.com/) (SVG/PNG)
- [Clearbit logos](https://clearbit.com/logo) (PNG)
- Vendor docs (e.g. AWS, Azure, GCP brand guidelines)

Keep filenames lowercase and use `.png` for compatibility.

