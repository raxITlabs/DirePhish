# Operation Midnight Drain — Incident Response Rehearsal Seed

## Organization Profile: NovaPay Inc.

NovaPay is a Series C fintech company (valued at $820M) headquartered in San Francisco with engineering offices in London and Bangalore. The company processes $2.1B in annual payment volume for 14,000 SMB merchants across the US and EU. NovaPay stores PCI-DSS-scoped cardholder data, merchant PII, and transaction records across AWS us-east-1 (primary) and eu-west-1 (EU data residency). The company employs approximately 400 people, with a 6-person security team and a 45-person engineering organization.

NovaPay's core platform runs on Kubernetes (EKS), with a PostgreSQL database cluster (RDS) for transaction data, Redis for session management, and S3 for document storage. Internal communications use Slack and Google Workspace. The VPN is Tailscale. CI/CD runs on GitHub Actions deploying to staging and production EKS clusters.

---

## Key Personnel and Relationships

### Executive Leadership

**Marcus Chen, CEO** — Former Goldman Sachs VP. Aggressive growth mindset, preparing for Series D fundraise in Q2. Deeply concerned about reputational damage. Has a pattern of wanting to control narrative timing. Reports to the board. Direct reports: CISO, CTO, CFO, General Counsel, VP Marketing.

**Diane Okafor, CTO** — Technical co-founder. Manages engineering org. Close working relationship with IR Lead. Tends to prioritize system availability over security lockdowns. Has root access to production infrastructure. Sometimes bypasses change management during outages.

**Raj Patel, CISO** — Joined 14 months ago from a large bank. Still building out the security program. Reports to CEO (not CTO — this was a condition of his hiring). Cautious, process-oriented. Has been pushing for a tabletop exercise for months but hasn't gotten budget approval. Relationship with CTO is cordial but has tension over security's authority to mandate engineering changes.

### Security Team

**Yuki Tanaka, IR Lead** — 5 years of IR experience, previously at CrowdStrike. Reports to CISO. Runs a 3-person incident response team. Technically strong, direct communicator, sometimes clashes with executives who want softer messaging. Has established but untested IR playbooks. Works US Pacific hours.

**Sam Oduya, SOC Analyst (Senior)** — Night shift, based in London. First responder for off-hours alerts. Experienced but has only been at NovaPay for 4 months. Still learning the environment. Has a tendency to second-guess severity assessments because he was criticized at his last job for over-escalating.

**Priya Sharma, SOC Analyst (Junior)** — Based in Bangalore. On the same overnight rotation as Sam. 1.5 years of experience total. Technically capable but defers to Sam on escalation decisions. Has strong log analysis skills.

**Alex Kim, Security Engineer** — Manages SIEM (Datadog Security), EDR (CrowdStrike Falcon), and WAF rules. US Pacific hours. The only person who fully understands the detection pipeline. Currently on PTO in Hawaii — has limited connectivity.

### Engineering

**Jordan Liu, VP Engineering** — Reports to CTO. Manages the platform and infrastructure teams. Protective of uptime SLAs (99.95% target). Will push back hard on any containment action that requires taking production systems offline.

**Nina Vasquez, Lead Platform Engineer** — Manages the Kubernetes infrastructure and has deep knowledge of the network architecture. One of three people with production database access. Based in SF, US Pacific hours. Has a strong working relationship with the security team.

**Tomás Reyes, Senior Backend Engineer** — Manages the payment processing service. Knows the transaction pipeline intimately. Based in London. Would be critical for understanding blast radius of any database compromise.

### Legal and Compliance

**Catherine Park, General Counsel** — Former fintech regulatory attorney. Reports to CEO. Manages outside counsel relationship with Morrison & Foerster. Acutely aware of GDPR Article 33 (72-hour notification requirement), PCI-DSS breach notification rules, and California CCPA requirements. Will insist on preserving forensic evidence before any remediation.

**David Okonkwo, Compliance Manager** — Reports to General Counsel. Manages the PCI-DSS compliance program and regulator relationships. Has a pre-existing relationship with NovaPay's PCI QSA (Qualified Security Assessor). Knows which data stores are in PCI scope.

### Communications

**Lisa Huang, VP Marketing/Communications** — Reports to CEO. Manages external communications and customer relationships. No security background. Will want to craft messaging that minimizes customer alarm. Has a template for breach notification from a previous company but it was for a much smaller incident.

**Ryan Torres, Customer Success Lead** — Manages relationships with NovaPay's top 50 merchants (representing 40% of transaction volume). These merchants have contractual SLAs and breach notification clauses. Some have the right to audit NovaPay's security practices post-incident.

### External Parties

**FBI Cyber Division, SF Field Office** — NovaPay has a pre-existing relationship through InfraGard. Agent Diana Morris is their point of contact.

**CrowdStrike IR Retainer** — NovaPay has a 40-hour incident response retainer with CrowdStrike. Activation requires CISO approval and has a 4-hour SLA for remote engagement.

**Cyber Insurance Carrier (Coalition)** — Policy requires notification within 48 hours of a confirmed breach. Carrier has its own preferred forensics vendor (Kroll) and may insist on using them instead of CrowdStrike.

---

## The Breach: Initial Indicators

### Timeline of Events (UTC)

**Friday, Day 0:**

- **14:32** — A NovaPay developer, Michael Torres (junior backend engineer, London office), receives a LinkedIn message from a recruiter for a "Senior Fintech Engineer" role at a well-known company. The message contains a link to a "job description PDF" hosted on a lookalike domain (novapay-careers.com, registered 3 days ago). Michael clicks the link on his corporate laptop, which downloads and executes a malicious payload disguised as a PDF. The payload is a custom loader that establishes a Cobalt Strike beacon.

- **14:34** — The Cobalt Strike beacon connects to a C2 server at 185.220.101.47 (known APT infrastructure, not yet in NovaPay's threat intel feeds). CrowdStrike Falcon on Michael's endpoint generates a medium-severity alert: "Suspicious process injection detected — svchost.exe spawning encoded PowerShell." The alert is routed to the SOC queue.

- **15:10** — Sam Oduya (SOC, London) reviews the alert. The alert is medium severity. Michael's laptop shows no further anomalous activity in the past 30 minutes (the beacon is sleeping on a 45-minute interval). Sam notes it but decides to monitor rather than escalate, given the medium severity and apparent inactivity. He adds a watchlist entry for Michael's endpoint.

- **17:00** — London office end of day. Sam's shift ends. The alert remains in "investigating" status. Handoff notes are minimal: "Medium alert on mtorres-laptop, possible false positive, monitoring."

- **22:15** — The Cobalt Strike beacon wakes and begins internal reconnaissance. The attacker runs `nltest /dclist` and `net group "Domain Admins"` via the beacon. No alerts are generated — these commands are not in NovaPay's current detection rules.

- **23:48** — The attacker uses Mimikatz to extract cached credentials from Michael's laptop. They obtain Michael's domain password and a cached service account credential (svc-deploy) that has elevated privileges in the CI/CD pipeline. CrowdStrike Falcon generates a high-severity alert: "Credential dumping tool detected — possible Mimikatz execution."

**Saturday, Day 1:**

- **00:05** — Priya Sharma (SOC, Bangalore) sees the high-severity Mimikatz alert. She cross-references it with Sam's earlier note about mtorres-laptop. She messages Sam on Slack (he's off-shift, asleep). She's unsure whether to page Yuki Tanaka (IR Lead) — it's 4 PM Saturday in SF, and the IR escalation playbook says "High severity alerts during off-hours: page IR Lead within 15 minutes." But Priya has never paged Yuki before and worries about a false positive.

- **00:22** — Priya decides to investigate further before paging. She pulls CrowdStrike process trees and confirms the Mimikatz activity is real. She also discovers the earlier beacon activity that Sam had marked as "monitoring."

- **00:41** — Priya pages Yuki Tanaka via PagerDuty. Yuki acknowledges within 3 minutes.

- **00:55** — Yuki reviews the evidence remotely. She immediately recognizes this as a confirmed compromise: initial access via social engineering, C2 beacon established, credential theft in progress. She declares an incident: SEV-1.

- **01:10** — Yuki attempts to isolate Michael's laptop via CrowdStrike network containment. She discovers the attacker has already moved laterally: there are beacon callbacks from a second host — the CI/CD build server (build-runner-03). The svc-deploy credential was used to SSH into the build server at 23:52.

- **01:15** — Yuki begins the IR notification chain:
  - Pages Raj Patel (CISO) — acknowledged at 01:22
  - Pages Nina Vasquez (Platform Engineering) — acknowledged at 01:25
  - Attempts to reach Alex Kim (Security Engineer, on PTO) — no response
  - Messages Sam Oduya on Slack — Sam wakes up and joins at 01:40

- **01:30** — Raj Patel joins the incident Slack channel. His first question: "Do we have evidence of data exfiltration?" Yuki says not yet, but the build server has access to production deployment secrets, including database connection strings. If those secrets are compromised, the attacker could potentially access the production PostgreSQL cluster containing cardholder data and merchant PII.

- **01:45** — The attacker, still active on build-runner-03, accesses the GitHub Actions secrets store and extracts production database credentials, AWS IAM keys, and Stripe API keys. They use the database credentials to connect to the production PostgreSQL replica (read-only) in us-east-1 and begin exfiltrating merchant records. The queries are structured to stay under the database's slow-query threshold.

- **02:00** — Yuki calls an emergency bridge. Attendees: Yuki, Raj, Priya, Sam, Nina. Yuki proposes immediate containment: isolate both compromised hosts, rotate all secrets accessible from the build server, and take the CI/CD pipeline offline. Nina flags that taking CI/CD offline will block the Saturday morning hotfix deployment that Jordan Liu (VP Eng) has been coordinating for a critical payments bug affecting EU merchants.

- **02:15** — Raj Patel escalates to Marcus Chen (CEO). Marcus is alarmed. His first concern: "The Series D roadshow starts in 10 days. Who else knows about this?" Raj explains the situation. Marcus asks Raj to "keep this tight" — minimal disclosure until they understand the full scope. Raj is uncomfortable but agrees to limit notification for now.

- **02:30** — Diane Okafor (CTO) joins the bridge after Raj loops her in. She's immediately concerned about production database access. She asks Nina to check database audit logs for unusual query patterns. Nina finds the exfiltration queries: SELECT statements pulling merchant_name, email, tax_id, bank_account_number from the merchants table. Approximately 3,200 records have been accessed in the last 45 minutes.

- **02:45** — The room goes quiet when Nina reads back the queried fields. This is PCI-scoped data. GDPR-protected PII. The 72-hour GDPR notification clock arguably started when they confirmed compromise with data access capability (legal will debate whether it starts at discovery of breach vs. confirmation of exfiltration). Catherine Park (General Counsel) needs to be notified.

- **03:00** — Yuki pushes hard for full containment: kill the database connection, rotate all production credentials, invoke the CrowdStrike retainer for forensics. Diane pushes back — she wants to understand the blast radius first before "blowing everything up." Jordan Liu (VP Eng), now awake and on the bridge, is strongly against taking production offline: "We have $4.2M in transactions queued for Saturday morning processing. If we take the DB offline, those payments fail."

---

## Current Situation (Day 1, 03:00 UTC — Simulation Start Point)

The attacker is still active on the network. They have access to the production database (read-only replica) and are continuing to exfiltrate data. The security team has confirmed the breach but containment actions are being debated. Key tensions:

1. **Containment vs. Availability**: Yuki wants immediate lockdown. Jordan and Diane want to keep payment processing running. Every minute of delay means more data exfiltrated.

2. **Disclosure Timing**: Marcus wants to control the narrative. Catherine needs to start the GDPR clock. Lisa hasn't been told yet. Ryan's top merchants have contractual notification rights.

3. **Resource Gaps**: Alex Kim (security engineer) is unreachable on PTO. The CrowdStrike retainer hasn't been activated yet. The team is running on a skeleton weekend crew across three time zones.

4. **Evidence Preservation vs. Remediation**: Catherine will want forensic evidence preserved before any systems are wiped or rebuilt. But the longer they wait, the more data the attacker exfiltrates.

5. **External Notification Cascade**: FBI? Cyber insurance (48-hour notification)? PCI QSA? Each has different triggers, timelines, and implications. The insurance carrier may insist on their own forensics vendor, potentially conflicting with the CrowdStrike retainer.

6. **Attacker Adaptation**: The attacker may detect containment actions and accelerate — deploy ransomware, destroy evidence, or pivot to more sensitive systems.

---

## Environment Configuration Notes

### Communication Platforms (for simulation)
The simulation should model interactions on two platforms:

**Twitter/X (Public)**: Security researchers, journalists, and competitors monitor NovaPay. If the breach leaks, expect external pressure. A security researcher (@h4ckwatch, 45K followers) has already noticed the novapay-careers.com domain registration via Certificate Transparency logs and tweeted: "Interesting — someone just registered novapay-careers.com with a Let's Encrypt cert. Phishing campaign targeting @NovaPay employees? 🤔" — 12 retweets, 34 likes so far.

**Reddit (r/cybersecurity, r/fintech)**: Community discussion about fintech security practices. If the breach becomes public, expect threads analyzing NovaPay's response, comparing to similar incidents, and speculation about regulatory consequences.

### Agent Behavior Guidance
- SOC analysts should exhibit realistic alert fatigue and escalation hesitation
- Executives should balance business impact against security recommendations
- Legal should inject regulatory complexity and evidence preservation requirements
- Engineering should resist containment actions that impact availability
- External observers (Twitter/Reddit) should react to any information that leaks
- The attacker should adapt their tactics based on observed defender actions
