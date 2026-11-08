# System Context Flow Diagram

This context-level diagram shows the people and external services that exchange
information with the STI Global City Reservation System. It is inferred from
the current client and Cloud Functions code. Firestore collections and internal
processes are intentionally grouped at this level.

```mermaid
flowchart LR
    Requestor["Requestor"]
    Endorser["Endorser"]
    Approver["Approvers<br/>Building Admin · OSA · MIS<br/>Room Checker · Academic Head · School Admin"]
    SuperAdmin["Super Admin"]

    System(["STI Global City<br/>Reservation System"])

    Auth[("Firebase Authentication")]
    Database[("Cloud Firestore")]
    Functions{{"Cloud Functions"}}
    Cloudinary[("Cloudinary Image Hosting")]
    EmailJS[("EmailJS")]

    Requestor -->|"Sign-up, sign-in, profile data,<br/>reservation requests, edits, cancellations"| System
    System -->|"Authentication and reservation status,<br/>schedule, notifications and feedback"| Requestor
    EmailJS -->|"Reservation outcome email"| Requestor

    Endorser -->|"Endorsement decisions and remarks"| System
    EmailJS -->|"Approval request email when endorsement is due"| Endorser

    Approver -->|"Approval, rejection or modification decisions;<br/>facility, equipment and user administration"| System
    System -->|"Pending requests, reservation details,<br/>approval workflow and management data"| Approver
    EmailJS -->|"Approval request email for the active role"| Approver

    SuperAdmin -->|"Workflow overrides, user and system<br/>administration, reporting"| System
    System -->|"Reservations, approvals, inventory,<br/>users and system status"| SuperAdmin

    System <-->|"Sign-in, account creation,<br/>password reset and identity state"| Auth
    System <-->|"User profiles, reservations, approvals,<br/>facilities, inventory, settings and archives"| Database
    Database -->|"Reservation or facility document changes"| Functions
    Functions -->|"Recalculated remaining facility capacity"| Database
    System <-->|"Profile image upload and hosted image URL"| Cloudinary
    System -->|"Active-step approval requests<br/>and reservation status emails"| EmailJS
```

## Flow notes

- **Requestors** create and update their reservations, view schedules, and
  receive workflow outcomes.
- **Endorsers and approvers** act on reservation requests. Approval capability
  depends on role and the configured approval sequence; super admins can
  override the normal sequence.
- **Firebase Authentication** handles account identity and authentication.
  Role/profile records are maintained separately in Firestore.
- **Cloud Firestore** stores the application's operational records, including
  `users`, `super_users`, `reservations`, `archive`, `facilities`, `equipments`,
  `utilities`, `unavailableDates`, `pending_profiles`, and
  `app_settings/signupOptions`.
- **Cloud Functions** listen for reservation and facility writes and recalculate
  facility remaining capacity.
- **Cloudinary** hosts profile images; the application stores the resulting
  image URLs in user/profile records.
- **EmailJS** sends approval requests only to the currently active approval
  step, then notifies the next step as the reservation advances. It also sends
  reservation outcome emails to requestors.
