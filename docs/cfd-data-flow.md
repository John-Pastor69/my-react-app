# Facility Reservation System Context and Data Flow

This document describes the current application as implemented in the
repository. It uses Mermaid flowcharts to represent a context diagram (Level 0)
and progressively decomposed data-flow diagrams (Levels 1-3).

## Notation and scope

- Rectangles represent external entities.
- Rounded nodes represent processes.
- Cylinders represent data stores or external services.
- Arrows represent data moving between entities, processes, and stores.
- Firestore relationships and process boundaries reflect application behavior;
  they are not security-rule or deployment-boundary guarantees.
- Email is sent through the configured email service integration. Firebase
  Authentication, Firestore, and Storage are external managed services from
  the application's point of view.

## Level 0 - Context diagram

The whole reservation application is represented as one process.

```mermaid
flowchart LR
    Requestor[Requestor]
    Approver[Endorser and approver roles]
    Admin[Building Admin, MIS, Super Admin]
    System[Facility Reservation System]
    Auth[(Firebase Authentication)]
    Store[(Cloud Firestore)]
    Storage[(Firebase Storage)]
    Email[Email service]

    Requestor -->|Credentials, profile data, reservation request| System
    System -->|Account status, reservation status, schedule| Requestor
    Approver -->|Approval decision and remarks| System
    System -->|Assigned requests and decision status| Approver
    Admin -->|User, resource, availability, and signup configuration changes| System
    System -->|Dashboard, directory, calendar, and inventory data| Admin

    System <-->|Sign-in identity and verification| Auth
    System <-->|Profiles, reservations, resources, calendar, settings, archive| Store
    System <-->|Profile image and banner files| Storage
    System -->|Verification and reservation email messages| Email
```

## Level 1 - System processes and data stores

```mermaid
flowchart LR
    Requestor[Requestor]
    Staff[Endorser and approver roles]
    Admin[Building Admin, MIS, Super Admin]
    EmailService[Email service]
    Auth[(Firebase Authentication)]

    P1([1.0 Authenticate and manage profiles])
    P2([2.0 Submit and manage reservations])
    P3([3.0 Review and approve reservations])
    P4([4.0 Manage resources and calendar availability])
    P5([5.0 Manage users and signup configuration])
    P6([6.0 View schedules, dashboards, and notifications])

    D1[(D1 User profiles: users, super_users)]
    D2[(D2 Active reservations)]
    D3[(D3 Archived reservations)]
    D4[(D4 Facilities, equipment, utilities)]
    D5[(D5 Unavailable dates)]
    D6[(D6 Signup options and settings)]
    D7[(D7 Browser profile assets: Firebase Storage)]

    Requestor -->|Credentials, signup fields, profile changes| P1
    P1 <-->|Identity and email verification| Auth
    P1 <-->|Read/write profile and account state| D1
    P1 <-->|Signup configuration| D6
    P1 -->|Verification message| EmailService
    P1 -->|Profile image or banner| D7
    P1 -->|Account status and profile| Requestor

    Requestor -->|Reservation details and edits| P2
    P2 -->|Check date and resource availability| D5
    P2 -->|Check facilities and active conflicts| D2
    P2 <-->|Read resources and requester profile| D4
    P2 <-->|Create or update request| D2
    P2 -->|Endorsement request message| EmailService
    P2 -->|Submission result| Requestor

    Staff -->|Approval, rejection, return, remarks| P3
    P3 <-->|Read assigned request| D2
    P3 -->|Update status, approval map, history| D2
    P3 -->|Move rejected or completed request| D3
    P3 -->|Request status message| EmailService
    P3 -->|Approval queue and result| Staff

    Admin -->|Resource and availability changes| P4
    P4 <-->|Create or update resources| D4
    P4 <-->|Set or remove unavailable date and remark| D5

    Admin -->|Role changes, account actions, signup options| P5
    P5 <-->|Read and update users| D1
    P5 <-->|Read and update signup choices| D6

    Requestor -->|View own schedule and status| P6
    Staff -->|View assigned and system schedule| P6
    Admin -->|View analytics, alerts, and user summaries| P6
    P6 <-->|Read reservations and approval state| D2
    P6 <-->|Read archived history| D3
    P6 <-->|Read profiles and role notifications| D1
    P6 <-->|Read resource inventory| D4
    P6 <-->|Read date blocks and remarks| D5
    P6 -->|Schedule, dashboard, and notifications| Requestor
    P6 -->|Queue, schedule, and dashboard| Staff
    P6 -->|Dashboard and alerts| Admin
```

## Level 2 - Reservation lifecycle decomposition

This expands process 2.0 and shows how a request is validated, saved, reviewed,
and eventually archived.

```mermaid
flowchart LR
    Requestor[Requestor]
    Approver[Endorser and approval roles]
    EmailService[Email service]

    P21([2.1 Enter event, dates, people, and resources])
    P22([2.2 Load current resource and calendar data])
    P23([2.3 Validate required fields and date range])
    P24([2.4 Exclude unavailable dates])
    P25([2.5 Check facility time and capacity conflicts])
    P26([2.6 Save or update reservation])
    P27([2.7 Route request for endorsement and approval])
    P28([2.8 Record decision and notify requester])
    P29([2.9 Archive rejected or completed request])

    D1[(User profiles)]
    D2[(Facilities, equipment, utilities)]
    D3[(Unavailable dates)]
    D4[(Active reservations)]
    D5[(Archived reservations)]

    Requestor -->|Event and reservation fields| P21
    P21 -->|Requested resources and date range| P22
    P22 <-->|Read inventory and facility limits| D2
    P22 <-->|Read calendar date blocks| D3
    P22 -->|Profile and resource context| P23
    D1 -->|Current user and requester role| P23
    P23 -->|Valid request| P24
    P23 -->|Missing or invalid field feedback| Requestor
    P24 <-->|Unavailable date IDs and remarks| D3
    P24 -->|Daily schedule with unavailable dates excluded| P25
    P25 <-->|Compare active reservations and facility use| D4
    P25 -->|Conflict details| Requestor
    P25 -->|Validated schedule and request| P26
    P26 <-->|Create, edit, or resubmit request| D4
    P26 -->|Submission confirmation| Requestor
    P26 --> P27
    P27 -->|New endorsement request| EmailService
    P27 -->|Request enters assigned approval queue| Approver
    Approver -->|Approve, reject, return for modification, remarks| P28
    P28 -->|Update status, approval map, and history| D4
    P28 -->|Decision notification| EmailService
    P28 -->|Decision and remarks| Requestor
    P28 -->|Rejected reservation snapshot| P29
    P29 -->|Write archive snapshot and remove active record| D5
    P29 -->|Completed approved reservation snapshot| D5
```

## Level 3 - Detailed request submission and approval flow

This expands validation and decision processing. The active application checks
unavailable dates and facility conflicts again during submission to avoid
relying only on potentially stale client state.

```mermaid
flowchart TD
    User[Signed-in requestor]
    Endorser[Endorser]
    Approver[Assigned approval role]
    Email[Email service]

    A([3.1 Open reservation form])
    B([3.2 Load profile, signup options, facilities, equipment, utilities, unavailable dates])
    C([3.3 Enter requester, event, date, time, facility, participant, equipment, and utility values])
    D{Required fields and time schedule valid?}
    E([3.4 Build one schedule entry per available date])
    F{Any date remains available?}
    G([3.5 Re-read unavailable dates from Firestore])
    H{Latest schedule still has available dates?}
    I([3.6 Re-read active reservations and check facility overlap and capacity])
    J{Facility conflict found?}
    K([3.7 Save reservation as Pending, or update existing request])
    L([3.8 Send endorsement request when an endorser email is provided])
    M([3.9 Determine next approval step from role hierarchy and prior decisions])
    N{Decision}
    O([3.10 Update approval status, remarks, and history log])
    P([3.11 Return for modification with remarks])
    Q([3.12 Update request and resubmit])
    R([3.13 Archive rejected request and remove active copy])
    S([3.14 Notify requestor of decision])
    T[Show validation or conflict feedback]

    D1[(D1 User profiles and signup settings)]
    D2[(D2 Facilities, equipment, and utilities)]
    D3[(D3 Unavailable dates)]
    D4[(D4 Active reservations)]
    D5[(D5 Archived reservations)]

    User --> A --> B
    B <-->|Profile and signup configuration| D1
    B <-->|Inventory and facility limits| D2
    B <-->|Current unavailable calendar dates| D3
    B --> C --> D
    D -->|No| T
    T -->|Correct fields and schedule| C
    D -->|Yes| E --> F
    F -->|No| T
    F -->|Yes| G
    G <-->|Fresh unavailable date records| D3
    G --> H
    H -->|No available date| T
    H -->|Yes| I
    I <-->|Latest active reservation records| D4
    I --> J
    J -->|Yes: show date, time, facility, or capacity conflict| T
    J -->|No| K
    K -->|Create or update request document| D4
    K -->|Submission status| User
    K --> L
    L -->|Endorsement email| Email
    L --> M
    M -->|Assigned request| Approver
    Approver -->|Approve, reject, or return with remarks| N
    N -->|Approve or continue workflow| O
    O -->|Approval status and history| D4
    O -->|Continue to next role if required| M
    N -->|Return for changes| P
    P -->|Modification status and remarks| D4
    P -->|Return request and remarks| User
    User -->|Corrected values and resubmission remark| Q
    Q -->|Update request and append history| D4
    Q --> M
    N -->|Reject| R
    R -->|Write historical snapshot| D5
    R -->|Delete rejected active document| D4
    O --> S
    P --> S
    R --> S
    S -->|Approval, return, or rejection email| Email
    S -->|Decision and remarks| User
```

## Level 3 - Administration, calendar, and account lifecycle

```mermaid
flowchart LR
    Admin[Building Admin, MIS, Super Admin]
    NewUser[New user]
    SignedInUser[Signed-in user]
    Email[Email service]
    Auth[(Firebase Authentication)]

    A([3.15 Create account and verify email])
    B([3.16 Resolve role and enforce account state])
    C([3.17 Assign or change user role])
    D([3.18 Manage facilities, equipment, and utilities])
    E([3.19 Mark calendar date unavailable with required remark])
    F([3.20 Remove unavailable date])
    G([3.21 Read dashboard, pending queue, schedule, and alerts])
    H([3.22 Update profile, two-factor settings, or profile assets])

    U[(users)]
    SA[(super_users)]
    CFG[(app_settings/signupOptions)]
    RES[(reservations)]
    ARC[(archive)]
    RESOURCES[(facilities, equipments, utilities)]
    DATES[(unavailableDates)]
    FILES[(Firebase Storage)]

    NewUser -->|Signup fields| A
    A <-->|Create identity and email verification status| Auth
    A <-->|Read account types and dropdown options| CFG
    A -->|Create pending or requestor profile| U
    A -->|Verification email| Email
    SignedInUser -->|Sign-in identity| B
    B <-->|Validate identity and email verification| Auth
    B <-->|Read role, status, and 2FA policy| U
    B <-->|Check super-admin identity| SA
    B -->|Role-specific access, or block sign-in| SignedInUser

    Admin -->|Select role for user| C
    C <-->|Read and update profile; record role-change notification| U
    C -->|Role-change message to affected user| SignedInUser
    Admin -->|Add, update, remove resource| D
    D <-->|Manage resource documents| RESOURCES
    D -->|Updated inventory| G
    Admin -->|Select date and save remark| E
    E -->|Create or update date document| DATES
    Admin -->|Clear date availability| F
    F -->|Delete date document| DATES

    SignedInUser -->|Profile edits and 2FA action| H
    H <-->|Read/update user or super-user profile| U
    H <-->|Super-admin profile when applicable| SA
    H <-->|Upload profile image/banner and save URL| FILES

    SignedInUser -->|Dashboard, calendar, or directory view| G
    Admin -->|Dashboard, pending-user, or resource overview| G
    G <-->|Read reservations and approval state| RES
    G <-->|Read completed/rejected history| ARC
    G <-->|Read user and role state| U
    G <-->|Read inventory| RESOURCES
    G <-->|Read unavailable dates and remarks| DATES
    G -->|Dashboard, pending count/list, or schedule| SignedInUser
    G -->|Role-authorized dashboard and alerts| Admin
```

## Operational notes

- A signup can create a regular user profile with a `pending` role when the
  selected account type maps to faculty. Email verification is required before
  normal sign-in; Super Admin is looked up in its separate collection.
- Role-change messages are carried on profile data. Pending-user alerts and
  dashboard counts are computed from user profiles, rather than stored in a
  standalone notification collection.
- MIS and Building Admin can review pending users, while assignment of the
  `pending` role is restricted to Super Admin.
- Calendar unavailability records contain a date and administrator remark.
  Reservation submission excludes unavailable days while retaining other days
  in the requested date range.
- The approval process updates the active reservation through approval roles.
  Rejected and completed reservations may be moved into the archive.
- Firestore data is schemaless. The named stores and flows represent current
  application usage, and do not imply relational constraints or authorization
  rules.
