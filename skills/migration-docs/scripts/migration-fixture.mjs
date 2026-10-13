export const validAssessment = `# Migration Assessment: Orders Platform

## Scope & Principles

- **Source:** On-premise VMware cluster, datacenter A
- **Target:** Azure, West Europe landing zone
- **Driver:** Datacenter A lease ends in Q4 and the hardware is out of support.
- **Change Budget:** config-only
- **Out of Scope:** The corporate directory and the reporting warehouse.

## Source Inventory

| ID | Component | Type | Runtime | Data | Depends On | Evidence |
|---|---|---|---|---|---|---|
| S-1 | Orders API | Compute | Node.js 20 on RHEL 9 VM | - | S-2, S-3, S-6 | docker/docker-compose.yml |
| S-2 | Orders DB | Database | PostgreSQL 15 | 250 GB, personal data | - | docker/docker-compose.yml, Interview: DBA |
| S-3 | Invoice Files | Storage | NFS share | 1.2 TB, invoices | - | /etc/fstab on the app host (Interview: Ops) |
| S-4 | Nightly Export | Scheduler | cron on the app host | - | S-2 | ops/crontab |
| S-5 | FTP Gateway | Integration | vsftpd 3 | - | S-3 | Interview: Ops |
| S-6 | Corporate LDAP | Identity | OpenLDAP | Staff accounts | - | src/config/auth.js |

## Target Mapping

| Component | Strategy | Target Service | Application Impact | Rationale |
|---|---|---|---|---|
| S-1 | Rehost | Azure VM, same image | Config | Same OS and runtime; only the endpoints change |
| S-2 | Replatform | Azure Database for PostgreSQL Flexible Server | None | Wire-compatible; the host is already an environment variable |
| S-3 | Replatform | Azure Files (NFS) | None | The mount path stays /mnt/invoices, so the code is untouched |
| S-4 | Rehost | cron on the Azure VM | None | Same crontab, same host |
| S-5 | Retire | - | None | No client has used it in 12 months (Interview: Ops) |
| S-6 | Retain | On-premise LDAP over site-to-site VPN | None | Out of scope; reachable by the same hostname through the VPN |

## Application Change Register

| ID | Component | Type | Change | Why Not Infrastructure-Side | Owner |
|---|---|---|---|---|---|
| C-1 | S-1 | Config | Set DATABASE_URL to the new server name in the deployment environment | The server name differs; a CNAME is rejected by the managed service certificate | Developer |

## Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Replication lag delays the cutover window | Medium | High | Start continuous replication two weeks early and gate the cutover on lag below 5 seconds |
| R-2 | VPN latency slows LDAP logins | Low | Medium | Cache sessions and measure login time in check V-3 |

## Ambiguities & Open Questions

- The backup retention requirement for invoices is not documented. Ask the compliance officer.
`;

export const validPlan = `# Migration Plan: Orders Platform

## Prerequisites & Context

- **Assessment:** ./assessment.md

## Waves

| Wave | Components | Depends On | Cutover Window | Downtime Budget |
|---|---|---|---|---|
| 1 | S-2, S-3 | - | Any weekday, no freeze needed | 0m |
| 2 | S-1, S-4 | 1 | Saturday 02:00-05:00 CET | 30m |

## Data Migration

| Component | Method | Sync | Integrity Check |
|---|---|---|---|
| S-2 | PostgreSQL logical replication | Continuous | Row counts and checksums of the 20 largest tables |
| S-3 | azcopy sync from the NFS share | Final Delta | File count and SHA-256 manifest comparison |

## Connectivity & Identity

- **Network:** Site-to-site VPN between datacenter A and the landing zone hub; private endpoints for the database and files.
- **DNS Cutover:** Lower the orders.example.com TTL to 60 seconds one day before, then repoint it to the Azure load balancer.
- **Identity:** The corporate LDAP stays on-premise and is reached over the VPN with the same hostname.
- **Secrets:** Existing secrets are copied by name into Azure Key Vault orders-kv and referenced from the deployment environment.
- **Certificates:** The existing public certificate is imported into Key Vault; the database uses the platform certificate.

## Validation

| ID | Check | Wave | Success Criterion |
|---|---|---|---|
| V-1 | Replication lag and manifest comparison | 1 | Lag is below 5 seconds and the manifest diff is empty |
| V-2 | Smoke test of order creation and invoice download | 2 | 100 percent of 20 scripted requests return 2xx |
| V-3 | LDAP login time over the VPN | 2 | The 95th percentile login is below 800 ms |

## Rollback

- **Point of No Return:** Step 2.4, when the source database is promoted read-only and replication is reversed.

| Wave | Trigger | Rollback Action | Data Reconciliation |
|---|---|---|---|
| 1 | Lag stays above 60 seconds for 1 hour | Stop replication and drop the target database | None; the source is unchanged |
| 2 | Any V-2 failure before step 2.4 | Repoint DNS to the datacenter load balancer and restart the on-premise services | Replay writes captured during the window from the application log |

## Decommission

| Component | Condition |
|---|---|
| S-5 | Two weeks after cutover with zero connection attempts logged |

## Open Questions & Assumptions

_None._
`;

export const validRunbook = `# Migration Runbook: Orders Platform

## Prerequisites & Context

- **Plan:** ./migration-plan.md

## Go/No-Go Criteria

- [ ] Replication lag is below 5 seconds for 24 hours.
- [ ] The rollback has been rehearsed in staging.
- [ ] The business owner approved the Saturday window.

## Wave 1: Data

### Step 1.1: Start replication of S-2

- **Owner:** DBA
- **Action:** Create the subscription on the target server with \`CREATE SUBSCRIPTION orders_sub ...\` for S-2.
- **Verification:** Replication lag is below 5 seconds (V-1).
- **Rollback:** Drop the subscription and the target database.
- **Duration:** 2h

### Step 1.2: Copy invoice files for S-3

- **Owner:** Ops
- **Action:** Run \`azcopy sync\` for S-3 and compare the manifests.
- **Verification:** The manifest diff is empty (V-1).
- **Rollback:** Delete the copied files.
- **Duration:** 6h

## Wave 2: Application

### Step 2.1: Freeze writes on S-1

- **Owner:** Developer
- **Action:** Put S-1 in maintenance mode and wait for replication to drain.
- **Verification:** Lag is 0 bytes.
- **Rollback:** Disable maintenance mode.
- **Duration:** 10m

### Step 2.2: Start S-1 and S-4 on Azure

- **Owner:** Ops
- **Action:** Deploy the same image with the C-1 environment value and enable the S-4 crontab.
- **Verification:** Order creation and invoice download pass (V-2) and the LDAP login time is acceptable (V-3).
- **Rollback:** Stop the Azure services and disable maintenance mode on-premise.
- **Duration:** 30m

### Step 2.3: Repoint DNS

- **Owner:** Ops
- **Action:** Point orders.example.com at the Azure load balancer.
- **Verification:** V-2 passes through the public name.
- **Rollback:** Point the name back to the datacenter load balancer.
- **Duration:** 5m

### Step 2.4: Reverse replication and promote

- **Owner:** DBA
- **Action:** Promote the target database and reverse replication to the source.
- **Verification:** The target accepts writes and the source follows.
- **Rollback:** _None._
- **Duration:** 15m

## Post-Cutover

- **Hypercare:** Two weeks with the on-premise stack kept stopped but intact.
- **Handover:** Operations accepts the new runbook and monitoring after hypercare.
`;
