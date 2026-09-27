"use strict";

const MAX_ENCODED_PDF_LENGTH = 1000000;
const MAX_PDF_BYTES = 750000;

function createPrivateMemberPdfHandler({ db, verifyIdToken, projectId, legacyMembers, documentId, fileName }) {
  return async (req, res) => {
    res.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("X-Content-Type-Options", "nosniff");

    if ((process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT) !== projectId) {
      res.status(503).json({ error: "This private document is unavailable in this environment." });
      return;
    }
    if (req.method !== "GET") {
      res.set("Allow", "GET");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }

    const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = authorization.slice(0, 4096).replace(/^Bearer\s+/i, "");
    if (!token) {
      res.status(401).json({ error: "Sign in to access this document." });
      return;
    }

    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (_) {
      res.status(401).json({ error: "Your sign-in session has expired. Please sign in again." });
      return;
    }

    const email = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";
    const provider = decoded.firebase && decoded.firebase.sign_in_provider;
    const verifiedIdentity = decoded.email_verified === true &&
      (provider !== "google.com" || /@(fcps\.edu|fcpsschools\.net)$/.test(email));
    if (!verifiedIdentity || !email) {
      res.status(403).json({ error: "Use your verified, approved portal sign-in to access this document." });
      return;
    }

    try {
      const member = await db.collection("portal_members").doc(email).get();
      const approved = member.exists
        ? (member.data() || {}).active === true
        : legacyMembers.has(email);
      if (!approved) {
        res.status(403).json({ error: "Only active, approved portal members can access this document." });
        return;
      }

      const snapshot = await db.collection("private_member_documents").doc(documentId).get();
      const payload = snapshot.exists ? snapshot.data() || {} : {};
      const encodedPdf = payload.pdfBase64;
      if (
        payload.mimeType !== "application/pdf" ||
        typeof encodedPdf !== "string" ||
        encodedPdf.length > MAX_ENCODED_PDF_LENGTH ||
        encodedPdf.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedPdf)
      ) {
        res.status(503).json({ error: "The private document has not yet been securely uploaded by an admin." });
        return;
      }
      const pdfBytes = Buffer.from(encodedPdf, "base64");
      if (pdfBytes.length > MAX_PDF_BYTES || pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        res.status(503).json({ error: "The private document has not yet been securely uploaded by an admin." });
        return;
      }

      res.set("Content-Type", "application/pdf");
      res.set("Content-Length", String(pdfBytes.length));
      res.set(
        "Content-Disposition",
        `${req.query && req.query.download === "1" ? "attachment" : "inline"}; filename="${fileName}"`
      );
      res.status(200).send(pdfBytes);
    } catch (error) {
      console.error("private member document failed:", error);
      res.status(500).json({ error: "Unable to load the document right now." });
    }
  };
}

module.exports = { createPrivateMemberPdfHandler };