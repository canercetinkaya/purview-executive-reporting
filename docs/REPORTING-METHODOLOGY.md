# Reporting Methodology & Posture Formula

## 1. Transparent Posture Score Calculation

Unlike opaque security scores, `calculatePostureScore()` (`packages/domain/src/scoring.ts`) exposes its complete formula, component weights, raw inputs, and fallback behavior inside the UI **Formula** modal:

```text
PostureScore = Sum(availableComponentScore * renormalizedWeight)
```

| Component | Base Weight | Inputs & Formula | Behavior When Unavailable |
| :--- | :--- | :--- | :--- |
| **DLP Risk Control** | `25%` | `100 - min(45, highSeverity*1.8) - min(25, externalSharing*0.45) - (highSeverity/total)*30` | Excluded; remaining weights re-normalized to 100% |
| **Incident Resolution Efficiency** | `25%` | `resolutionRate*65 + 35 - min(40, openHighCritical*6) - min(20, max(0, mttr-4)*1.2)` | Excluded; remaining weights re-normalized to 100% |
| **Sensitivity Label Governance** | `20%` | Direct verified `labelCoveragePct`, or `min(80, definedLabels*8)` capped at 80 when unlabeled files at rest are `ApiUnsupported` | Excluded if label connector fails |
| **Insider & Communication Risk** | `15%` | `100 - insiderHigh*8 - insiderTotal*1.2 - commEscalated*4` | Excluded when both modules are `NotLicensed` |
| **Connector & Audit Hygiene** | `15%` | `(healthyConnectors / totalConnectors)*80 + (auditAvailable ? 20 : 0)` | Reflects live ingestion health |

## 2. Strict Activity Attribution Rule

- **Microsoft-Generated Activity:** Policy rule hits, Defender XDR alert correlations, and automated quarantine/block actions are platform capabilities licensed by Microsoft. They are displayed strictly for reference and **never** counted as Managed Service team deliverables.
- **Managed Service Team Activity:** Only logged analyst reviews, incident investigations, case closures, DLP false-positive reductions, policy/rule modifications, exception evaluations, proactive health checks, and customer requests are counted in **Managed Service Value**.

## 3. Zero-Hallucination Executive Narrative

`generateExecutiveNarrative()` (`apps/api/src/analytics/narrative.ts`) renders all 8 Management Story sections deterministically from `MonthlySnapshot` and `Recommendation` values and automatically populates `dataLimitationsNote` whenever any connector reports `Unavailable`, `PermissionMissing`, `NotLicensed`, `CollectionFailed`, or `ApiUnsupported`.
