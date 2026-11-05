# Data Flow Diagram — Level 3

This Level 3 DFD further decomposes the Level 2 processes into data capture,
retrieval, transformation, and storage steps. The diagrams show data inputs and
outputs only; decision branches, validation rules, and workflow-control
conditions belong in activity diagrams and are intentionally excluded here.
Data-store IDs D1–D10 match the [Level 0 DFD](./data-flow-diagram-level-0.md),
[Level 1 DFD](./data-flow-diagram-level-1.md), and
[Level 2 DFD](./data-flow-diagram-level-2.md).

Flows are inferred from the current client and Cloud Functions source. They
describe application behavior, not Firestore-enforced relationships or a live
database export. Process numbering adds a fourth component to the Level 2 IDs;
the numbered steps are logical decompositions, not necessarily separate code
modules.

## Segment 1: Identity & Dashboard Granularity

flowchart LR
    Person["Account Holder"]
    Admin["MIS / Super Admin"]
    Auth["Firebase Auth"]

    P111(["1.1.1 Capture Credentials"])
    P112(["1.1.2 Exchange Auth Data"])
    P122(["1.2.2 Retrieve User Profile"])
    P131(["1.3.1 Record Profile Fields"])
    P132(["1.3.2 Record Security Data"])
    
    P641(["6.4.1 Retrieve Dashboard Source"])
    P642(["6.4.2 Aggregate Data"])
    P643(["6.4.3 Format Results"])

    D1[("D1: Profiles")]
    D4[("D4: Active Reservations")]

    Person -->|"Inputs"| P111
    P111 -->|"Account Data"| P112
    P112 -->|"Requests"| Auth
    Auth -->|"UID Response"| P112
    Auth -->|"UID"| P122
    P122 -->|"Query"| D1
    D1 -->|"Fields"| P122
    
    Person -->|"Values"| P131
    P131 -->|"Update Fields"| D1
    Person -->|"2FA / Session"| P132
    P132 -->|"Update Security"| D1

    Admin -->|"Filters"| P641
    P641 -->|"Query Roles"| D1
    P641 -->|"Query Records"| D4
    D1 -->|"Data"| P642
    D4 -->|"Data"| P642
    P642 -->|"Metrics"| P643
    P643 -->|"Dashboard Display"| Admin

## Segment 2: Reservation Assembly & Approval Data

flowchart LR
    Requestor["Requestor"]
    Approver["Approver Hierarchy"]

    P211(["2.1.1 Capture Form Fields"])
    P212(["2.1.2 Retrieve Profiles"])
    P213(["2.1.3 Assemble Request"])
    P215(["2.1.5 Assemble Availability"])
    P222(["2.2.2 Store Active Data"])
    
    P311(["3.1.1 Retrieve History Data"])
    P312(["3.1.2 Assemble Approval Context"])
    P321(["3.2.1 Capture Decision Fields"])
    P322(["3.2.2 Store History & Status"])
    P332(["3.3.2 Copy Data to Archive"])

    D1[("D1: Profiles")]
    D4[("D4: Active Reservations")]
    D5[("D5: Archived Reservations")]
    D6[("D6: Facilities")]

    Requestor -->|"Raw Fields"| P211
    P211 -->|"Data"| P212
    P212 -->|"Fetch Details"| D1
    D1 -->|"Profile Data"| P213
    P213 -->|"Request Structure"| P215
    D6 -->|"Reference Data"| P215
    P215 -->|"Payload"| P222
    P222 -->|"Write Record"| D4

    D4 -->|"Query"| P311
    P311 -->|"Data"| P312
    D1 -->|"Role Query"| P312
    P312 -->|"Context Fields"| Approver
    
    Approver -->|"Decision Input"| P321
    P321 -->|"Format"| P322
    P322 -->|"Update Record"| D4

    D4 -->|"Closed Reference"| P332
    P332 -->|"Write Copy"| D5
    P332 -->|"Delete Original"| D4

## Segment 3: Inventory & Capacity Calculation Data

flowchart LR
    ResourceAdmin["Resource Admin"]
    CloudFunction["Cloud Functions"]

    P411(["4.1.1 Record Facility Fields"])
    P413(["4.1.3 Record Equipment Data"])
    P432(["4.3.2 Assemble Calendar Resource Data"])
    
    P511(["5.1.1 Receive Event Data"])
    P521(["5.2.1 Retrieve Allocation Data"])
    P522(["5.2.2 Aggregate Participant Totals"])

    D4[("D4: Active Reservations")]
    D6[("D6: Facilities")]
    D7[("D7: Equipment")]

    ResourceAdmin -->|"Facility Values"| P411
    P411 -->|"Write"| D6
    ResourceAdmin -->|"Equipment Values"| P413
    P413 -->|"Write"| D7

    D4 -->|"Active Data"| P432
    D6 -->|"Location Data"| P432
    D7 -->|"Inventory Data"| P432
    P432 -->|"Compiled Source"| CalendarUser

    CloudFunction -->|"Payload"| P511
    P511 -->|"Reference ID"| P521
    D6 -->|"Capacity Int"| P521
    D4 -->|"Participant Count"| P521
    P521 -->|"Math Operations"| P522
    P522 -->|"Write remainingCap"| D6

## Decomposition index

| Level 2 process family | Level 3 data processes |
|---|---|
| 1.1–1.4 Authentication and profiles | Capture identity/profile fields; exchange auth data; retrieve profiles; store security and image fields |
| 2.1–2.2 Reservation submission | Capture form data; retrieve reference records; assemble schedule/resources; store reservation data |
| 3.1–3.4 Approval and archive | Retrieve reservation context; capture decision fields; store history, status, and archive records |
| 4.1–4.3 Resources and calendar | Capture/store resource data; retrieve reservation data; assemble and format calendar output |
| 5.1–5.2 Capacity | Receive write-event fields; retrieve facility allocations; aggregate and store capacity data |
| 6.1–6.4 Administration and dashboard | Retrieve and store account/configuration data; aggregate and format dashboard records |

### Modeling notes

- These diagrams show data capture, retrieval, aggregation, formatting, and
  persistence. They intentionally omit control-flow branches, validation
  criteria, authorization rules, and approval sequencing.
- Approval decisions, status values, and operation types are modeled only as
  input or stored fields; arrows do not indicate conditional outcomes.
- Reservation schedules, approvals, and history are embedded in reservation
  records. Archiving is represented as a data copy to `archive` and a removal
  from `reservations`.
- EmailJS is omitted because notification delivery is disabled and is not
  required to describe the system's data inputs and stores.
