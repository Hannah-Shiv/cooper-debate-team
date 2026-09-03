# Track Applications Google Sheet sync

The application pipeline is:

**Google Form → Track Applications sheet → Apps Script → Firebase Cloud Function → Firestore → Track Applications coach page**

The existing coach page (`members-applications.html`) already reads the private `applications` collection and supports:

- **Hold** — stored as `reviewStatus: "pending"`
- **Accept** — stored as `reviewStatus: "accepted"`
- **Decline** — stored as `reviewStatus: "declined"`

## Sheet columns to add

In row 1 of the **Form Responses 1** tab, add these exact headers at the end of the form-response columns:

```text
Firestore sync status
Firestore application ID
Firestore sync error
```

Do not rename them after installing the script. They are operational columns and are not applicant-facing form questions.

## Apps Script

Copy `scripts/track-applications-sync.gs` into the Apps Script project attached to the response spreadsheet. The current spreadsheet filename is **Debate Application Form - 2026-2027 (Responses)** and the current response tab is **Form Responses 1**. The script uses the tab name.

The script:

- installs an installable form-submit trigger;
- maps the form response row into the existing Firestore application shape;
- preserves uploaded essay and Google Doc links from linked sheet cells;
- writes `Synced` plus the Firestore application ID on success;
- writes `Error` plus a readable message when validation or delivery fails;
- provides `syncPendingTrackApplications()` for retrying rows that are not marked `Synced`.

The field aliases near the top of the script are matched to the current FCPS Google Form headers. Long question headers are matched by their opening text, so line breaks and explanatory text can change without breaking the mapper.

The FCPS form does not collect the separate parent/guardian, Tabroom, fee, judging, transportation, or Google Meet fields used by the website's direct application form. Those values remain blank rather than being invented. The coach page displays every field the FCPS form does collect, including the required essay or Google Doc link, other activities, and comments or concerns.

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

The application document ID is deterministic from the spreadsheet, original Form timestamp, school email, and student name. If Apps Script retries the same response—or if someone sorts the sheet and changes its row number—it updates the same Firestore document instead of creating a duplicate.

The coach page uses the original Google Form timestamp as the application submission time, including when older rows are synced later.

If a coach has already accepted, declined, or held an application, a later sheet retry preserves that review decision. The sheet sync only updates the submitted application data and sync metadata.

The current Firebase project is also the live project. Test with a designated test response before sending real applications through the new trigger.