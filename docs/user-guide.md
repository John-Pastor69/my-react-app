# STI Global Facility Reservation User Guide

This guide explains how to use the STI Global facility booking and approval system, including login, account setup, reservation requests, approvals, calendars, and administrative tools.

## 1. Overview

The system helps students, faculty, staff, and administrators manage room and facility bookings for events, meetings, classes, and other activities. It combines:

- Reservation submission and validation
- Approval workflows with endorser and admin review
- Real-time availability checks for facilities, equipment, and utilities
- Calendar and schedule viewing
- Facility, equipment, and user management for administrators
- Security features such as email verification, two-factor authentication, session locking, and account blocking

The system supports multiple user types, each with different permissions:

- Requestor: can reserve facilities and manage personal account
- Endorser: approves or endorses reservations for their group or department
- Building admin: manages facilities and availability
- MIS / MIS admin: manages users, equipment, utilities, and broader system operations
- Super admin: full system-level control
- Pending users: newly created accounts waiting for activation or review

## 2. Accessing the System

### Sign in

1. Open the application in your browser.
2. Enter your email and password.
3. If your account is configured for email verification, verify your email first before login.
4. If two-factor authentication is enabled, complete the verification code after sign-in.

### Allowed email domains

Access is restricted to approved domains such as:

- @gmail.com
- @outlook.com
- @globalcity.sti.edu.ph
- @globalcity.sti.edu

If your email is not from an approved domain, the system denies access.

### Account creation and signup

1. Choose the Sign Up tab.
2. Fill in your personal details and account type.
3. Select the appropriate department, course, or other required data depending on your account type.
4. Confirm your password and complete the signup form.
5. Submit the signup request.
6. Check your inbox and verify your email before logging in.

The system validates your form inputs, account type, student number, and other fields before creating the account.

### Password reset

If you forget your password:

1. Click Forgot Password.
2. Enter your registered email address.
3. A password reset link is sent to your email.
4. Follow the reset instructions and sign in again.

A cooldown is applied to prevent repeated reset attempts.

## 3. Security and Session Rules

The system includes important security protections:

- Email verification is required before login for regular users.
- Two-factor authentication can be enabled for stronger security.
- One browser tab or one active session is enforced per account.
- If a user signs in from another browser or tab, the earlier session may be terminated.
- Blocked accounts are denied access.
- Inactive sessions set user status to Offline.

## 4. Main Navigation

After login, the sidebar menu shows the tools available to your role.

### Common pages for all users

- Reserve: Create a reservation request
- Schedule: Browse upcoming facilities or schedule information
- Calendar: View bookings across dates and facilities
- Account: View and manage your personal profile and account settings

### Role-based pages

- Dashboard: Available to elevated roles such as endorsers, admin users, and super admins
- Approval: Used by approvers, administrators, and super admins to review pending reservations
- Facilities: Used by building admins and MIS/admin roles to manage facility inventory and settings
- Equipments: Used by MIS and admin users to manage equipment stock and availability
- Users: Used by MIS/admin users to manage user access and roles

## 5. Your Account and Profile

Open the Account page to view and update your details.

### Profile information

You can update:

- Full name
- Contact details
- Department, course, or account attributes
- Phone number
- Profile photo and banner image

### Profile image approval

If your role is a requestor, some profile image updates may need administrative approval before they appear publicly.

### 2FA setup

If your account allows it, you can enable two-factor authentication:

1. Open the Account page.
2. Go to the security or 2FA section.
3. Generate a QR code.
4. Scan it with an authenticator app.
5. Enter the verification code to complete setup.

Once enabled, you must enter the code during future login sessions.

### Delete account

The system allows users to request account deletion, with a verification flow that includes password confirmation and final security checks.

## 6. Creating a Reservation

The Reserve page is where requests are created.

### Reservation form fields

The form typically includes:

- Requestor information
- Requestor type and attributes
- Full name and contact details
- Email address
- Event name
- Number of expected participants
- Event purpose
- Facility selection
- Specific room or location
- Equipment requested
- Utility requirements
- Air-conditioning time range
- Endorser information and approval details

### Facility and date rules

The system checks:

- Facility availability
- Capacity limits
- Conflicts with existing reservations
- Date restrictions and unavailable dates
- Time range validity
- Lead-time rules for standard requestors

Some roles, such as MIS or building admin, can bypass standard lead-time restrictions.

### Reservation workflow

1. Select the facility or facilities needed.
2. Choose the date and time range.
3. Add participant counts, equipment, utilities, and any special room requirements.
4. Provide event details and purpose.
5. Choose or confirm the endorser.
6. Submit the request.
7. The system validates the request and saves it.

### Reservation statuses

A reservation may move through various states, including:

- Pending
- Approved
- Rejected
- Cancelled
- Active / in-progress
- Archived / historical

The system also stores approval history and cancellation notes.

## 7. Approval Workflow

The Approval page is used by approvers and administrators to review reservations.

### Who can approve

Approval roles include:

- Endorser
- OSA
- Room checker
- Academic head
- School admin
- Building admin
- MIS
- Super admin

### How approval works

- Reservations are grouped by status and review queue.
- Approvers can search for a request by name, role, or details.
- Each request includes the approval tracker, which shows the required approval steps.
- Approved requests move to the next stage when the assigned role is ready.
- Certain admin roles can override or adjust workflow behavior.

### Cancellation

Authorized administrators may cancel reservations and require a cancellation remark before completing the action.

## 8. Calendar and Schedule Views

### Calendar

The Calendar page shows a month-based view of reserved events and blocked dates.

You can:

- Choose a date
- View event details for that day
- Check facility schedules
- Inspect data for active, archived, and unavailable dates
- Filter by event type or status

### Schedule

The Schedule page lists upcoming reservations and schedule information for selected facilities.

This helps users:

- Check upcoming bookings
- Plan events without conflicts
- See facility-specific schedules

## 9. Dashboard

The Dashboard is a role-based overview page used by elevated staff and administrative users.

It may show:

- Pending requests and queue activity
- Reservation summaries and statuses
- Approval workload by person or role
- Facility and system activity over time
- Search and filtering by requestor, date, or status

The dashboard is customized by user role and can help staff monitor the system quickly.

## 10. Facility, Equipment, and Utility Management

### Facilities

Building administrators and MIS/admin roles can manage facilities through the Facilities page.

Available functions include:

- Add new facilities
- Edit existing facility profiles
- Update status (Available, Maintenance, Unavailable)
- Set capacities
- Toggle exclusive scheduling
- Delete or archive obsolete entries

### Equipment and utilities

MIS and admin roles can manage equipment and utilities in their management pages.

Functions include:

- Add item records
- Update total stock and availability
- Track reserved vs. remaining counts
- Set item status
- Delete obsolete items

The system automatically calculates effective availability based on active reservations.

## 11. User Management

MIS/admin users can manage system users from the Users page.

Capabilities may include:

- Reviewing user profiles
- Assigning or changing roles
- Blocking or activating accounts
- Updating signup configuration and account types
- Reviewing pending profiles or new user signups
- Managing pending approvals for profile updates

This page is the primary administrative area for account administration.

## 12. Common System Rules

The application enforces several rules across the platform:

- Users must use valid account types and fields.
- Capacity and conflict rules prevent overlapping bookings.
- Dates and times must be valid and within allowed reservation hours.
- Only allowed roles can access certain screens.
- Information is updated in real time from Firestore.
- Blocked users and invalid sessions cannot continue using the application.

## 13. Best Practices

- Verify your email before trying to sign in.
- Keep your profile information current.
- Use the correct endorser and event details when creating a request.
- Check your facility schedule before submitting to avoid conflicts.
- Review approval status regularly.
- Use the calendar to monitor upcoming bookings.
- Keep 2FA enabled if your account requires it.

## 14. Troubleshooting

### “Access denied” at login

Possible causes:

- Your email is not from an allowed domain
- Your account is blocked
- Your email has not been verified

### “Your account is already open in another tab”

The system only allows one active session per account. Close the other tab or sign out there before continuing.

### Reservation not submitted

Check:

- Selected date and time are valid
- Facility capacity is sufficient
- No conflicting reservation exists
- Required fields are filled in correctly
- You selected a valid endorser or approval path

### Dashboard or approval page is missing

This usually means your role does not have the permissions required for that page.

## 15. Summary

This system is designed to manage facility reservations from request to approval to completion, while also giving staff and administrators the tools to manage terms, capacity, and user access.

The most important user flows are:

- Sign up or sign in
- Create and submit a reservation
- Await approval and track status
- Review the calendar and schedule
- Update account information
- Use admin tools for facilities, equipment, and users when assigned permissions

If you are a regular user, focus on Reserve, Schedule, Calendar, and Account. If you are a team approver or administrator, use Dashboard, Approval, Facilities, Equipment, and Users as needed.
