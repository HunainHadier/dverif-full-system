# Dverif Employee API Guide

This guide covers the employee self-service endpoints in `employee-apis.postman_collection.json`. It excludes organization-admin, sub-admin review, payroll-generation, and other staff-only APIs.

## Import and configure

1. In Postman, choose **Import** and import `employee-apis.postman_collection.json`.
2. Create and select a Postman environment. Add these variables:
   - `employeeEmail`: employee portal account email
   - `employeePassword`: account password; mark this variable sensitive/local
   - `otp`: current one-time code received by email
   - `accessToken`: leave blank; the Verify OTP request fills it
   - `identityType`, `identityId`: leave blank; Login fills them
   - `inviteToken`, `passwordResetToken`, `newPassword`: only needed for onboarding or password reset; keep them local and sensitive
   - `expenseClaimUuid`, `attachmentUuid`, `letterUuid`, `notificationId`, `referenceId`, `ticketUuid`: fill from the relevant API response
3. Keep the collection's `baseUrl` as `http://localhost:5000/api/v1` for local development, or change it to the API host for your test environment. Include `/api/v1`.
4. Send **Login - request email OTP**, copy the OTP from the account email into the environment's `otp`, then send **Verify OTP - save access token**. Successful OTP verification saves the bearer token in `accessToken`.
5. Authenticated requests inherit the collection's bearer token. The refresh token is an HttpOnly cookie; keep Postman's cookie jar enabled for the API host.

Do not export a populated environment or share access tokens, passwords, OTPs, receipts, or employee personal data.

## Employee API groups

| Group | Endpoints | Notes |
|---|---|---|
| Authentication and profile | `POST /auth/login`, `POST /auth/verify-otp`, `POST /auth/resend-otp`, `POST /auth/refresh`, `POST /auth/user/logout`, `POST /auth/user/forgot-password`, `POST /auth/user/reset-password`, `GET /auth/user/invite-status`, `POST /auth/user/set-password`, `GET/PATCH /users/me`, `PATCH /users/preferred-language` | OTP verification is needed before calling protected routes. Profile editing accepts name, phone, and optionally a profile image; email cannot be changed. Password reset and invite setup require the one-time token sent by email. |
| Dashboard | `GET /dashboard` | Signed-in user's dashboard summary. |
| Attendance | `GET /attendance/today`, `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/history` | Check-in/out need no body. Organization IP policy and module subscription may apply. History supports pagination, date range and status filters. |
| Leave | `GET /leaves/types`, `GET /leaves/balance`, `GET /leaves/mine`, `POST /leaves` | Use a type ID returned by `/leaves/types`. Requests require a valid date range and available balance; approval is staff-only. |
| Payroll | `GET /salary-records/mine` | Returns only the caller's salary records. Optional `month` and `year` filters. |
| Expenses | `GET/POST /my/expenses`, `GET /my/expenses/:uuid`, `POST /my/expenses/:uuid/receipts`, `GET /my/expense-attachments/:attachmentUuid/download`, `DELETE /my/expense-attachments/:attachmentUuid` | Employee identity is inferred by the server; do not send `employee_uuid`. Claims need expense name, amount and date. Receipt upload uses multipart form-data key `files`; do not set its Content-Type manually. |
| Assets | `GET /my/assets` | Lists assets assigned to the caller. |
| Resignation | `GET/POST /my/resignation` | Submit `last_working_day` and `reason`; the server derives employee and request type. HR review is not an employee endpoint. |
| HR letters | `GET /my-letters`, `GET /my-letters/:uuid`, `GET /my-letters/:uuid/pdf` | Lists and returns only issued letters belonging to the caller. |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-by-reference/:referenceId`, `POST /notifications/read-all`, `GET/PATCH /notifications/preferences` | Preference updates use a `preferences` object with notification categories. |
| Organization support | `GET/POST /org/support/tickets`, `GET /org/support/tickets/:uuid`, `POST /org/support/tickets/:uuid/replies` | Employees can view/reply only to tickets they may access. Ticket status changes are staff-only. |

## Request examples

### Submit a leave request

```json
{
  "leave_type_id": 1,
  "requested_treatment": "paid",
  "start_date": "2026-11-20",
  "end_date": "2026-11-21",
  "reason": "Personal leave"
}
```

`requested_treatment` is `paid` or `unpaid`. Select `leave_type_id` from the leave types endpoint. Server-side balance and date validation still apply.

### Submit an expense claim

```json
{
  "expense_name": "Taxi to client site",
  "amount": 1250.00,
  "expense_date": "2026-11-03",
  "description": "Travel for a scheduled client meeting"
}
```

The expense date is when the cost occurred, and controls the payroll period if the claim is approved for payroll. The employee does not choose payout mode or claim status.

### Submit a resignation

```json
{
  "last_working_day": "2026-12-04",
  "reason": "I am resigning for a new opportunity."
}
```

Only one open resignation request is allowed. The employee cannot set its status or approve it.

## Typical testing order

1. Login, receive OTP, verify OTP.
2. Fetch profile and dashboard.
3. Check attendance status/history. Use check-in/out only against a permitted test account and a test environment.
4. Fetch leave types and balances before submitting a leave request.
5. Submit an expense claim, then optionally attach a test receipt. Save its UUID from the response before calling claim detail or receipt download/delete.
6. Fetch salary records, assets, letters, resignation status, notifications, and support tickets.
7. Test write endpoints only with test data. Attendance, leave submissions, expense claims, and resignations create persistent records.

## Common behavior

- The API base path is `/api/v1`.
- Most responses use a JSON envelope with `data` and a message; Postman scripts account for the wrapped or unwrapped response when capturing login values.
- Protected routes use `Authorization: Bearer <access token>`.
- A valid token is not enough if the user's organization subscription is inactive or the relevant module is disabled.
- APIs enforce ownership server-side. Replacing a UUID with another employee's UUID must not grant access.
- Use the backend's returned error message and HTTP status when debugging; common statuses include 400 (invalid input), 401 (not signed in/OTP), 403 (role/module/ownership policy), 404 (not found), and 409 (state conflict).
