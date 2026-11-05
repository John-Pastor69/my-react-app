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
    EmailJS[("EmailJS<br/>disabled in current configuration")]

    Requestor -->|"Sign-up, sign-in, profile data,<br/>reservation requests, edits, cancellations"| System
    System -->|"Authentication and reservation status,<br/>schedule, notifications and feedback"| Requestor

    Endorser -->|"Endorsement decisions and remarks"| System
    System -->|"Reservation endorsement requests<br/>(email sending currently disabled)"| Endorser

    Approver -->|"Approval, rejection or modification decisions;<br/>facility, equipment and user administration"| System
    System -->|"Pending requests, reservation details,<br/>approval workflow and management data"| Approver

    SuperAdmin -->|"Workflow overrides, user and system<br/>administration, reporting"| System
    System -->|"Reservations, approvals, inventory,<br/>users and system status"| SuperAdmin

    System <-->|"Sign-in, account creation,<br/>password reset and identity state"| Auth
    System <-->|"User profiles, reservations, approvals,<br/>facilities, inventory, settings and archives"| Database
    Database -->|"Reservation or facility document changes"| Functions
    Functions -->|"Recalculated remaining facility capacity"| Database
    System <-->|"Profile image upload and hosted image URL"| Cloudinary
    System -.->|"Would send reservation status emails<br/>if enabled"| EmailJS
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
- **EmailJS** calls are currently guarded by `SEND_EMAILS = false`; emails are
  not sent with the current configuration. The dashed flow indicates a
  configured-but-disabled integration.
