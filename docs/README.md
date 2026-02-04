# Nykaa JIT Access Portal — Documentation

**Folder:** `docs/`  
**Purpose:** Professional documentation for cross-team sharing

---

## Document Index

| Document | Description | Format |
|----------|-------------|--------|
| **1_Current_State_Before** | As-is state before changes; security gaps; architecture | .md, .docx |
| **2_Changes_Implemented** | What has been changed to date; change log | .md, .docx |
| **3_Roadmap_Next_Steps** | MVP 2 plan; phases; target architecture | .md, .docx |

---

## Converting to Microsoft Word (.docx)

### Option 1: Using Pandoc (Recommended)

If you have [Pandoc](https://pandoc.org/) installed:

```bash
cd docs/
pandoc 1_Current_State_Before.md -o 1_Current_State_Before.docx
pandoc 2_Changes_Implemented.md -o 2_Changes_Implemented.docx
pandoc 3_Roadmap_Next_Steps.md -o 3_Roadmap_Next_Steps.docx
```

### Option 2: Using Python Script

```bash
cd docs/
python generate_word_docs.py
```

### Option 3: Open in Word Directly

- Microsoft Word 2016+ can open `.md` files
- Open the .md file → Save As → Choose "Word Document (.docx)"

---

## Document Versions

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | February 2025 | Initial documentation set |

---

## Audience

- **Engineering:** Implementation details, file changes, architecture
- **Security:** Gap analysis, enforcement model, audit requirements
- **Product:** Scope, roadmap, success criteria
