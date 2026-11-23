import { GraphHttpClient, type IMicrosoftConnector } from './base.js';
import { GraphSecurityAlertsV2Connector } from './graphSecurityAlertsV2.js';
import { GraphSecurityIncidentsConnector } from './graphSecurityIncidents.js';
import { InformationProtectionLabelsConnector } from './informationProtectionLabels.js';
import { Office365DlpActivityConnector } from './office365DlpActivity.js';
import { PowerShellComplianceBridgeConnector } from './powershellComplianceBridge.js';
import { PurviewAuditLogConnector } from './purviewAuditLog.js';
import { RecordsAndEDiscoveryConnector } from './recordsAndEDiscovery.js';
import { SentinelAnalyticsConnector } from './sentinelAnalytics.js';

export function createConnectorSuite(httpClient = new GraphHttpClient()): IMicrosoftConnector[] {
  return [
    new GraphSecurityAlertsV2Connector(httpClient),
    new GraphSecurityIncidentsConnector(httpClient),
    new Office365DlpActivityConnector(httpClient),
    new InformationProtectionLabelsConnector(httpClient),
    new PurviewAuditLogConnector(httpClient),
    new RecordsAndEDiscoveryConnector(httpClient),
    new PowerShellComplianceBridgeConnector(),
    new SentinelAnalyticsConnector(),
  ];
}
