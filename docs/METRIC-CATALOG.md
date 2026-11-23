# Metric Catalog

| ID | Metric Name | Unit | Target (RAG Green) | Higher Is Better | Portal Route |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sc-posture` | Security & Compliance Posture Score | `/100` | `>= 80` | Yes | `/` |
| `sc-high-dlp` | High Severity DLP Events | `events` | `<= 10` | No | `/purview/dlp` |
| `sc-ext-sharing` | External Sensitive Sharing Indicators | `events` | `<= 15` | No | `/purview/dlp` |
| `sc-open-risks` | Open High/Critical Security Risks | `incidents` | `<= 2` | No | `/incidents` |
| `sc-mttr` | Incident Mean Time to Resolve (MTTR) | `hrs` | `<= 6 hrs` | No | `/incidents` |
| `sc-label-cov` | Sensitivity Label Coverage | `%` | `>= 75%` | Yes | `/purview/information-protection` |
| `sc-insider-high` | Insider Risk High-Severity Alerts | `alerts` | `<= 2` | No | `/purview/insider-risk` |
| `sc-fp-reduced` | False Positives Reduced by Service Team | `tuned` | `>= 5 / mo` | Yes | `/managed-service` |
