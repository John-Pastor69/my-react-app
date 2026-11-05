# Data Flow Diagram — Level 1

This Level 1 DFD decomposes the Level 0 processes into their main sub-processes.
The diagram is grouped into three segments for readability.
Segments follow the same process numbering and reuse the same data-store IDs as
the [Level 0 DFD](./data-flow-diagram-level-0.md). Flows are inferred from the
current application and Cloud Functions code, not from a live Firebase export.
See the [Level 2 DFD](./data-flow-diagram-level-2.md) for a further
decomposition of these processes.

## Segment 1: Identity, Profiles & Dashboards

flowchart LR
    AccountHolder["Account Holder"]
    Admin["MIS / Super Admin"]
    Auth["Firebase Auth"]
    Cloudinary["Cloudinary Hosting"]

    P1(["1.0 Manage Identity & Profiles"])
    P6(["6.0 System Administration & Dashboards"])

    D1[("D1: Users & Super Users")]
    D3[("D3: Pending Profiles")]
    D10[("D10: Signup Config")]

    AccountHolder -->|"Credentials, Profile Edits & Image"| P1
    P1 -->|"Auth Request"| Auth
    P1 -->|"Image File"| Cloudinary
    Auth -->|"UID Response"| P1
    Cloudinary -->|"Hosted URL"| P1
    P1 -->|"Read/Write Profile Data"| D1
    P1 -->|"Image Review Request"| D3

    Admin -->|"Role Updates & Config"| P6
    P6 -->|"Update Rules"| D10
    P6 -->|"Update User Status"| D1
    P6 -->|"Resolve Profile Images"| D3
    D1 -->|"User Source Data"| P6
    P6 -->|"Dashboard Analytics"| Admin

## Segment 2: Reservation & Approval Lifecycle

flowchart LR
    Requestor["Requestor"]
    Approver["Approval Committee / Admin"]

    P2(["2.0 Submit & Maintain Reservation"])
    P3(["3.0 Process Approvals & Archival"])

    D1[("D1: Profiles")]
    D4[("D4: Active Reservations")]
    D5[("D5: Archived Reservations")]

    Requestor -->|"Form Data & Resource Selection"| P2
    D1 -->|"Role Verification"| P2
    P2 -->|"Create Pending Record"| D4

    D4 -->|"Pending Requests"| P3
    Approver -->|"Endorsement/Approval Decision & Remarks"| P3
    P3 -->|"Update Status & Log History"| D4
    P3 -->|"Status Notification"| Requestor

    D4 -->|"Closed/Expired Records"| P3
    P3 -->|"Move to History"| D5

## Segment 3: Resource Availability & Capacity

flowchart LR
    Admin["Resource Admin"]
    CalendarUser["Calendar User"]
    CloudFunc["Cloud Functions"]

    P4(["4.0 Maintain Resources & Schedule Views"])
    P5(["5.0 Recalculate Facility Capacity"])

    D6[("D6: Facilities & Inventory")]
    D4[("D4: Active Reservations")]

    Admin -->|"Capacity & Inventory Edits"| P4
    P4 -->|"Update Resource Data"| D6

    CalendarUser -->|"Date Range & Filters"| P4
    D4 -->|"Active Schedules"| P4
    D6 -->|"Resource Status & Limits"| P4
    P4 -->|"Calendar View"| CalendarUser

    D4 -->|"Write Event Trigger"| CloudFunc
    CloudFunc -->|"Calculate Capacity"| P5
    P5 -->|"Update Remaining Capacity"| D6

## Process decomposition index

| Level 0 process | Level 1 sub-processes |
|---|---|
| 1.0 Authenticate and manage profiles | 1.1 authenticate account; 1.2 resolve role/profile; 1.3 update profile/security; 1.4 submit image change |
| 2.0 Submit and maintain reservations | 2.1 prepare and validate request; 2.2 create or update reservation |
| 3.0 Process endorsement and approval | 3.1 load approval context; 3.2 record endorsement/decision; 3.3 archive closed reservation; 3.4 identify/archive expired reservation |
| 4.0 Manage resources and check availability | 4.1 maintain facilities/inventory; 4.2 check availability/conflicts; 4.3 build calendar/schedule views |
| 5.0 Recalculate facility capacity | 5.1 detect relevant write; 5.2 recalculate remaining capacity |
| 6.0 Configure system and produce dashboard | 6.1 manage users/roles/status; 6.2 configure signup options; 6.3 review pending profile images; 6.4 aggregate dashboard/report data |

### Modeling notes

- The DFD is segmented for readability, but matching process numbers and D1–D10
  store IDs refer to the same processes and stores in every segment and in the
  Level 0 diagram.
- `4.2` is shown as a shared subprocess used by both reservation validation
  (`2.1`) and resource/calendar functionality. It reads current reservations,
  facilities, inventory, and unavailable dates; it does not persist a separate
  conflict record.
- Approval decisions and history logs are embedded in reservation documents.
  Archiving copies reservation data to `archive` and deletes it from
  `reservations`.
- Expiration checks are implemented in application code. The diagram groups
  them as a process that reads eligible reservations and moves expired records
  to the archive.
- Firestore relationships are application-level references, not enforced
  relational foreign keys. EmailJS flows are dotted because sending is disabled
  by the current configuration.
