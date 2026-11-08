# Data Flow Diagram — Level 2

This Level 2 DFD decomposes the Level 1 processes into data capture, retrieval,
transformation, and storage. The diagrams focus on data inputs and outputs;
decision branches and workflow-control rules are intentionally omitted. Process
and data-store IDs follow the [Level 0 DFD](./data-flow-diagram-level-0.md)
and [Level 1 DFD](./data-flow-diagram-level-1.md).

Flows are inferred from the current client and Cloud Functions source. They
describe application behavior, not Firestore-enforced relationships or a live
database export. See the [Level 3 DFD](./data-flow-diagram-level-3.md) for a
further data-focused decomposition.

## Segment 1: Identity, Administration, and Dashboards

flowchart LR
    AccountHolder["Account Holder"]
    Admin["MIS / Super Admin"]
    DashboardUser["Dashboard User"]
    Auth["Firebase Auth"]
    Cloudinary["Cloudinary"]

    P11(["1.1 Authenticate Account"])
    P12(["1.2 Resolve Role & Load Profile"])
    P13(["1.3 Update Profile & Security"])
    P14(["1.4 Submit Avatar/Banner"])
    
    P61(["6.1 Manage Users & Roles"])
    P62(["6.2 Configure Signup Options"])
    P63(["6.3 Review Pending Images"])
    P64(["6.4 Aggregate Dashboard Data"])

    D1[("D1: Profiles")]
    D3[("D3: Pending Profiles")]
    D10[("D10: Signup Config")]
    D4[("D4: Active Reservations")]

    AccountHolder -->|"Credentials"| P11
    P11 -->|"Verify / Reset"| Auth
    Auth -->|"UID & Status"| P12
    P12 -->|"Fetch Role"| D1
    D1 -->|"Role/Profile Data"| AccountHolder
    
    AccountHolder -->|"Edits & 2FA"| P13
    P13 -->|"Save Profile"| D1
    
    AccountHolder -->|"Image File"| P14
    P14 -->|"Upload"| Cloudinary
    Cloudinary -->|"Hosted URL"| P14
    P14 -->|"Request Review"| D3

    Admin -->|"Role/Status Changes"| P61
    P61 -->|"Update Account"| D1
    Admin -->|"Signup Fields"| P62
    P62 -->|"Save Config"| D10
    Admin -->|"Approve/Reject Image"| P63
    P63 -->|"Apply Verified URL"| D1
    P63 -->|"Clear Request"| D3

    DashboardUser -->|"Query & Filters"| P64
    D1 -->|"User Stats"| P64
    D4 -->|"Reservation Metrics"| P64
    P64 -->|"Dashboard Results"| DashboardUser



## Segment 2: Reservation and Approval Lifecycle

flowchart LR
    Requestor["Requestor"]
    Approver["Approver Hierarchy"]
    SuperAdmin["Super Admin"]

    P21(["2.1 Prepare & Validate Form"])
    P22(["2.2 Create/Update Reservation"])
    
    P31(["3.1 Load Approval Context"])
    P32(["3.2 Record Decision & Remarks"])
    P33(["3.3 Archive Closed Requests"])
    P34(["3.4 Clean Up Expired Requests"])

    D1[("D1: Profiles")]
    D4[("D4: Active Reservations")]
    D5[("D5: Archived Reservations")]

    Requestor -->|"Event, Schedule, Resource Details"| P21
    P21 -->|"Verify Endorser/Role"| D1
    P21 -->|"Validated Request"| P22
    P22 -->|"Create Record"| D4
    P22 -->|"Submission Result"| Requestor

    D4 -->|"Pending Record"| P31
    D1 -->|"Approver Roles"| P31
    P31 -->|"Workflow Context"| P32
    
    Approver -->|"Decision & Remarks"| P32
    SuperAdmin -->|"Override Action"| P32
    P32 -->|"Update Status & History"| D4
    P32 -->|"Status Notification"| Requestor

    Requestor -->|"Cancel Own Reservation"| P33
    P32 -->|"Rejected Records"| P33
    P33 -->|"Move to History"| D5
    P33 -->|"Delete Active"| D4

    D4 -->|"Eligible Pending Records"| P34
    P34 -->|"Move Expired to History"| D5
    P34 -->|"Delete Active"| D4

## Segment 3: Resource Availability and Capacity

flowchart LR
    ResourceAdmin["Building Admin / MIS"]
    CalendarUser["Calendar User"]
    CloudFunction["Cloud Functions"]

    P41(["4.1 Maintain Facilities & Inventory"])
    P42(["4.2 Check Availability / Conflicts"])
    P43(["4.3 Build Calendar Views"])
    
    P51(["5.1 Detect DB Write Event"])
    P52(["5.2 Recalculate Capacity"])

    D4[("D4: Active Reservations")]
    D6[("D6: Facilities")]
    D7[("D7: Equipment")]
    D9[("D9: Unavailable Dates")]

    ResourceAdmin -->|"Inventory & Status Changes"| P41
    P41 -->|"Update Capacity"| D6
    P41 -->|"Update Stock"| D7
    P41 -->|"Set Blocked Dates"| D9

    P42 -->|"Read Existing Bookings"| D4
    P42 -->|"Read Facility Limits"| D6
    P42 -->|"Read Stock"| D7
    P42 -->|"Read Blocked Dates"| D9
    P42 -->|"Conflict Result"| Requestor

    CalendarUser -->|"Date Filter Request"| P43
    D4 -->|"Active Data"| P43
    D6 -->|"Location Data"| P43
    P43 -->|"Rendered Schedule"| CalendarUser

    D4 -->|"Reservation Write"| CloudFunction
    D6 -->|"Facility Write"| CloudFunction
    CloudFunction -->|"Relevant Change"| P51
    P51 -->|"Trigger Recalculation"| P52
    D4 -->|"Read Current Allocations"| P52
    P52 -->|"Write Remaining Capacity"| D6



## Decomposition index

| Level 1 process | Level 2 data processes |
|---|---|
| 1.1–1.4 Authentication and profiles | Capture identity data; retrieve profiles; record profile, security, and image fields |
| 2.1–2.2 Reservation submission | Capture and assemble request data; retrieve reference data; store reservation records |
| 3.1–3.4 Approval and archive | Retrieve approval context; capture decision fields; store history and archive records |
| 4.1–4.3 Resources and calendar | Record resources; retrieve availability/calendar data; format calendar output |
| 5.1–5.2 Capacity | Receive write-event data; aggregate facility allocation data; store remaining capacity |
| 6.1–6.4 Administration and dashboard | Retrieve and record account/configuration data; aggregate dashboard sources |

### Modeling notes

- Process labels describe data capture, retrieval, aggregation, formatting, and
  storage. Validation rules, authorization branches, approval sequencing, and
  other control logic are intentionally outside these DFDs.
- Decision, status, role, and operation values remain present as data fields;
  arrows do not represent conditional outcomes.
- Reservation schedules, approval history, and resource allocations are
  embedded in reservation records. Archival is shown as record movement from
  `reservations` to `archive`.
- EmailJS delivery is omitted to keep the diagram focused on data inputs and
  stores. The application emails only the active approval step and sends
  reservation status updates to requestors.
