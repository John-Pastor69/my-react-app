# Firestore Logical and Physical ERDs

## Scope and interpretation

These diagrams describe the data model inferred from this repository's current
client and Cloud Functions code. They are a static code scan, not a live export
of a Firebase project. Field types and optionality are inferred from reads and
writes, and legacy documents may differ.

The physical ERD represents Firestore collections/documents and their embedded
maps and arrays. Firestore does not enforce the cross-collection references
shown here as foreign keys; the application joins documents using IDs. The
logical ERD normalizes embedded reservation data into business entities to
show the concepts and cardinalities independently of their Firestore storage.

## Logical ERD

This model treats an active reservation and its archived copy as one
reservation concept through its lifecycle. The physical implementation moves a
reservation document from `reservations` to `archive`.

```mermaid
erDiagram
    ACCOUNT {
        string uid PK
        string email
        string role
        string name
    }

    RESERVATION {
        string reservationId PK
        string referenceNumber
        string requestorUid FK
        string status
        string eventName
        date eventDate
        date endDate
    }

    FACILITY {
        string facilityId PK
        string name
        string code
        number maxCapacity
        string status
    }

    FACILITY_ALLOCATION {
        string reservationId PK, FK
        string facilityId PK, FK
        number expectedParticipants
    }

    EQUIPMENT {
        string equipmentId PK
        string name
        string sku
        number totalCount
        string status
    }

    EQUIPMENT_REQUEST {
        string reservationId PK, FK
        string equipmentId PK, FK
        number quantity
    }

    UTILITY {
        string utilityId PK
        string name
        string sku
        string status
    }

    UTILITY_REQUEST {
        string reservationId PK, FK
        string utilityId PK, FK
        number quantity
        string unit
    }

    SCHEDULE_SLOT {
        string slotId PK
        string reservationId FK
        string facilityId FK
        date date
        string startTime
        string endTime
    }

    APPROVAL_DECISION {
        string decisionId PK
        string reservationId FK
        string approverUid FK
        string roleKey
        string status
        datetime decisionAt
    }

    RESERVATION_HISTORY_ENTRY {
        string historyEntryId PK
        string reservationId FK
        string actorUid FK
        string role
        string action
        datetime occurredAt
        string remark
    }

    UNAVAILABLE_DATE {
        date date PK
        string remark
        string updatedBy FK
        datetime updatedAt
    }

    PENDING_PROFILE_CHANGE {
        string requestId PK
        string userUid FK
        string status
        string requestedAvatarUrl
        string requestedBannerUrl
        datetime submittedAt
    }

    SIGNUP_CONFIGURATION {
        string configurationId PK
        array accountTypes
        array dropdownTypes
    }

    ACCOUNT ||--o{ RESERVATION : requests
    RESERVATION ||--o{ FACILITY_ALLOCATION : allocates
    FACILITY ||--o{ FACILITY_ALLOCATION : allocated_to
    RESERVATION ||--o{ EQUIPMENT_REQUEST : requests
    EQUIPMENT ||--o{ EQUIPMENT_REQUEST : requested_as
    RESERVATION ||--o{ UTILITY_REQUEST : requests
    UTILITY ||--o{ UTILITY_REQUEST : requested_as
    RESERVATION ||--o{ SCHEDULE_SLOT : scheduled_in
    FACILITY o|--o{ SCHEDULE_SLOT : hosts
    RESERVATION ||--o{ APPROVAL_DECISION : receives
    ACCOUNT o|--o{ APPROVAL_DECISION : makes
    RESERVATION ||--o{ RESERVATION_HISTORY_ENTRY : records
    ACCOUNT o|--o{ RESERVATION_HISTORY_ENTRY : acts
    ACCOUNT ||--o| PENDING_PROFILE_CHANGE : submits
    ACCOUNT o|--o{ UNAVAILABLE_DATE : updates
```

`FACILITY_ALLOCATION`, `EQUIPMENT_REQUEST`, `UTILITY_REQUEST`,
`SCHEDULE_SLOT`, `APPROVAL_DECISION`, and `RESERVATION_HISTORY_ENTRY` are
logical entities. They are currently stored inside reservation documents as
arrays/maps rather than as separate collections. `ACCOUNT` unifies regular
users and super admins conceptually; they are stored in separate collections
physically.

## Physical ERD (current Firestore layout)

The field lists show the principal fields observed in code, not an exhaustive
validation schema. Dynamic signup attributes, historical fields, and
role-specific profile fields can add more fields.

```mermaid
erDiagram
    FIREBASE_AUTH_USER {
        string uid PK
        string email
        boolean emailVerified
        string displayName
    }

    USERS {
        string uid PK, FK
        string email
        string name
        string firstName
        string middleInitial
        string lastName
        string role
        string accountType
        string studentNumber
        string course
        string department
        string phone
        string officeLocation
        map signupDropdown
        map customAttributes
        array customFields
        string avatarUrl
        string bannerUrl
        array profileImageNotifications
        boolean emailVerified
        boolean twoFactorEnabled
        string twoFactorSecret
        string status
        string activeSessionId
        datetime lastActive
        datetime timeCreated
        datetime dateJoined
        string approvalView
    }

    SUPER_USERS {
        string uid PK, FK
        string email
        string name
        string role
        boolean twoFactorEnabled
        string twoFactorSecret
        string status
        string activeSessionId
        datetime lastActive
        string approvalView
    }

    RESERVATIONS {
        string reservationId PK
        string refNo
        string userId FK
        string userEmail
        string userRole
        string fullName
        string contactNumber
        string emailAddress
        string eventName
        array eventType
        string purpose
        string eventDate
        string endDate
        string startTime
        string endTime
        array schedule
        map facilitySchedules
        array facilities
        string specificRoom
        number expectedParticipants
        number specificRoomParticipants
        map facilityParticipants
        map requestorInfo
        map endorserInfo
        string endorserName
        string endorserEmail
        map selectedEquip
        array selectedUtilities
        map selectedUtilityUnits
        string otherEquipment
        string otherUtility
        number durationHours
        number days
        boolean aircon
        string status
        map approvals
        array historyLogs
        string modificationRemark
        string modificationRequestedBy
        string modificationRequestedByRoleKey
        string modificationRequestLogId
        string modificationRequestedAt
        string createdAt
        string updatedAt
    }

    ARCHIVE {
        string reservationId PK
        string refNo
        string userId FK
        string userEmail
        string userRole
        string eventName
        string eventDate
        string endDate
        string status
        array facilities
        map facilitySchedules
        map selectedEquip
        array selectedUtilities
        map selectedUtilityUnits
        map approvals
        array historyLogs
        string rejectionRemark
        string cancellationRemark
        string createdAt
        string archivedAt
        string expiredAt
    }

    FACILITIES {
        string facilityId PK
        string code
        string name
        string location
        number minCapacity
        number maxCapacity
        number capacity
        number remainingCap
        boolean exclusiveScheduling
        string status
        string statusClass
        string lastUpdated
    }

    EQUIPMENTS {
        string equipmentId PK
        string name
        string sku
        number totalCount
        number availableCount
        string status
        string statusClass
        string lastUpdated
    }

    UTILITIES {
        string utilityId PK
        string name
        string sku
        string status
        string statusClass
        string lastUpdated
    }

    UNAVAILABLE_DATES {
        string date PK
        string remark
        string updatedBy FK
        string updatedAt
    }

    PENDING_PROFILES {
        string requestId PK
        string userId FK
        string notificationId
        string userName
        string userEmail
        string status
        string requestedAvatarUrl
        string requestedBannerUrl
        timestamp submittedAt
    }

    APP_SETTINGS {
        string documentId PK
        array accountTypes
        array dropdownTypes
    }

    FIREBASE_AUTH_USER ||--o| USERS : "same uid"
    FIREBASE_AUTH_USER ||--o| SUPER_USERS : "same uid"
    USERS o|--o{ RESERVATIONS : "userId"
    SUPER_USERS o|--o{ RESERVATIONS : "userId"
    FACILITIES }o--o{ RESERVATIONS : "facilities array of ids"
    EQUIPMENTS }o--o{ RESERVATIONS : "selectedEquip map keys"
    UTILITIES }o--o{ RESERVATIONS : "selectedUtilities ids"
    USERS ||--o| PENDING_PROFILES : "uid / userId"
    USERS o|--o{ UNAVAILABLE_DATES : "updatedBy"
```

### Collection and embedding notes

- `users/{uid}` and `super_users/{uid}` are profile documents keyed by Firebase
  Authentication UID. `super_users` is checked first for super-admin accounts.
- `reservations/{reservationId}` is the active request. `archive/{reservationId}`
  receives the reservation data when it is rejected, cancelled, expired, or
  explicitly archived; the active document is deleted during that move.
- Reservation resource links are embedded: `facilities` is an array of IDs,
  `selectedEquip` is a map keyed by equipment ID and quantity, and
  `selectedUtilities` / `selectedUtilityUnits` hold utility selections.
- `schedule`, `facilitySchedules`, `facilityParticipants`, `approvals`, and
  `historyLogs` are embedded schedule, approval, and audit structures.
- `pending_profiles/{uid}` stores the latest pending profile-image change
  request. Approved/rejected image notification entries are embedded in the
  user's `profileImageNotifications` array.
- `app_settings/signupOptions` is the signup configuration document. Its
  `accountTypes` and `dropdownTypes` contain configurable signup metadata.
- Dates and timestamps are represented inconsistently in the current code
  (ISO strings, formatted strings, and Firestore timestamps). Some optional or
  legacy values also use different types, so consumers should tolerate those
  variations.
- Profile images are uploaded by the app to Cloudinary; the profile documents
  store image URLs rather than image binary data. Firebase Storage is initialized
  in the client but is not used by the inspected upload flow.
- Browser session IDs, login flags, and reservation drafts are stored in
  browser storage, not in Firestore, and are therefore outside these ERDs.
