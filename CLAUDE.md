## Design Context

### Users
Security professionals, CISOs, and red team consultants reviewing incident response simulation results. They're reading this after a 25-120 minute pipeline run. They need to extract findings, share with leadership, and plan remediation. They're used to reading pentest reports, SIEM dashboards, and compliance docs.

### Brand Personality
Technical. Precise. Trustworthy.

### Aesthetic Direction
- **Visual tone:** Pentest report brought to life. Structured, evidence-heavy, monospace throughout. Not a marketing dashboard, not a SaaS app. A technical instrument for security professionals.
- **References:** Pentest report PDFs (structured findings with evidence), Burp Suite reports, NIST compliance documents.
- **Anti-references:** Generic SaaS dashboards with big hero numbers and gradient cards. Loose, airy marketing layouts.
- **Theme:** Light mode only. Warm neutral background. White cards with corner brackets. Monospace fonts throughout.
- **Color:** OKLCH warm palette. Color is semantic, never decorative.

### Design Principles
1. **Every pixel is evidence.** Dead space is wasted credibility.
2. **Horizontal before vertical.** Use 2-column layouts to reduce scrolling.
3. **Structure communicates trust.** Consistent headers, dividers, progress bars signal rigor.
4. **Density matches domain.** Security professionals expect dense, scannable information.
5. **The report is the deliverable.** It should look good in screenshots, demos, and exports.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
