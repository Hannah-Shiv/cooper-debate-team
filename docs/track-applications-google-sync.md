# Track Applications Google Sheet sync

The application pipeline is:

**Google Form → Track Applications sheet → Apps Script → Firebase Cloud Function → Firestore → Track Applications coach page**

The existing coach page (`members-applications.html`) already reads the private `applications` collection and supports:

- **Hold** — stored as `reviewStatus: "pending"`
- **Accept** — stored as `reviewStatus: "accepted"`
- **Decline** — stored as `reviewStatus: "declined"`

## Sheet columns to add

In row 1 of the **Track Applications** sheet, add these exact headers at the end of the form-response columns:

```text
Firestore sync status
Firestore application ID
Firestore sync error
```

Do not rename them after installing the script. They are operational columns and are not applicant-facing form questions.

## Apps Script

Copy `scripts/track-applications-sync.gs` into the Apps Script project attached to the response spreadsheet.

The script:

- installs an installable form-submit trigger;
- maps the form response row into the existing Firestore application shape;
- writes `Synced` plus the Firestore application ID on success;
- writes `Error` plus a readable message when validation or delivery fails;
- provides `syncPendingTrackApplications()` for retrying rows that are not marked `Synced`.

The field aliases near the top of the script cover the current application vocabulary. If a Google Form question uses different wording, add that exact question text to its alias list.

## Protecting the sync endpoint

The Cloud Function is not public-write. It requires the `APPLICATION_SHEET_SYNC_SECRET` header.

1. Create a long random value that will be used only for this sync.
2. Set that value as the Firebase Functions secret named `APPLICATION_SHEET_SYNC_SECRET`.
3. In the spreadsheet Apps Script project, add a Script Property with:
   - **Property:** `APPLICATION_SHEET_SYNC_SECRET`
   - **Value:** the same random value
4. Deploy the `syncApplicationFromSheet` Firebase Function.
5. Run `installTrackApplicationsTrigger()` once from Apps Script and approve the requested permissions.

Never put the secret directly in the `.gs` source file or in a spreadsheet cell.

## Important behavior

The application document ID is deterministic for the spreadsheet, sheet name, and row number. If Apps Script retries the same row, it updates the same Firestore document instead of creating a duplicate.

If a coach has already accepted, declined, or held an application, a later sheet retry preserves that review decision. The sheet sync only updates the submitted application data and sync metadata.

The current Firebase project is also the live project. Test with a designated test response before sending real applications through the new trigger.