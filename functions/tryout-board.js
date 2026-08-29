const crypto = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const SEASON = "2026-2027";
const SESSIONS = new Set(["sep22", "sep23"]);
const GRADES = new Set(["7", "8"]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function validFcpsId(value) {
  return typeof value === "string" && /^\s*\d{7}\s*$/.test(value);
}

function displayName(value) {
  const parts = cleanText(value, 80).split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1).charAt(0).toUpperCase()}.` : parts[0] || "Student";
}

function identityKey(fcpsId) {
  return crypto.createHash("sha256").update(`${SEASON}:${fcpsId}`).digest("hex");
}

function normalizePreferenceIds(recordOrIds, legacyPartnerId) {
  const source = Array.isArray(recordOrIds)
    ? recordOrIds
    : recordOrIds && Array.isArray(recordOrIds.partnerIds)
      ? recordOrIds.partnerIds
      : legacyPartnerId || (recordOrIds && recordOrIds.partnerId)
        ? [legacyPartnerId || recordOrIds.partnerId]
        : [];
  return [...new Set(source
    .filter(value => typeof value === "string")
    .map(value => value.trim().slice(0, 80))
    .filter(Boolean))].slice(0, 4);
}

function normalizeStoredRecord(record) {
  return { ...record, partnerIds: normalizePreferenceIds(record) };
}

function firstValidMutualPreference(selfId, self, records) {
  return normalizePreferenceIds(self).find(partnerId => {
    const partner = records.get(partnerId);
    return partner &&
      !partner.withdrawn &&
      !partner.pairedWith &&
      normalizePreferenceIds(partner).includes(selfId);
  }) || null;
}

function remainingPreferenceIds(record, unavailableIds) {
  const unavailable = new Set(unavailableIds);
  return normalizePreferenceIds(record).filter(partnerId => !unavailable.has(partnerId));
}

function publicProjection(id, record) {
  return {
    id,
    season: SEASON,
    displayName: displayName(record.name),
    grade: record.grade,
    session: record.session,
    available: !record.pairedWith,
    status: record.pairedWith ? "paired" : "open",
    partnerId: record.pairedWith || null,
    revision: Number(record.revision) || 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function privateView(id, record, records) {
  const preferenceIds = normalizePreferenceIds(record);
  const partnerId = record.pairedWith || preferenceIds[0] || null;
  const partner = partnerId ? records.get(partnerId) : null;
  const paired = Boolean(record.pairedWith && partner && partner.pairedWith === id);
  return {
    id,
    name: record.name,
    displayName: displayName(record.name),
    grade: record.grade,
    session: record.session,
    partnerId,
    partnerIds: preferenceIds,
    partnerNames: preferenceIds
      .map(preferenceId => records.get(preferenceId))
      .filter(Boolean)
      .map(preference => displayName(preference.name)),
    partnerDisplayName: partner ? displayName(partner.name) : "",
    status: paired ? "mutual" : preferenceIds.length ? "pending" : "open",
    releasedReason: record.releasedReason === "partner-locked" ? "partner-locked" : "",
    revision: Number(record.revision) || 0,
  };
}

function validateIdentity(body) {
  const fcpsId = cleanText(body.fcpsId, 7);
  const name = cleanText(body.name, 80);
  const grade = cleanText(body.grade, 1);
  const session = cleanText(body.session, 8);
  if (!validFcpsId(fcpsId)) throw new Error("Enter the student’s seven-digit FCPS ID.");
  if (name.split(/\s+/).length < 2) throw new Error("Enter the student’s first and last name.");
  if (!GRADES.has(grade)) throw new Error("Select seventh or eighth grade.");
  if (!SESSIONS.has(session)) throw new Error("Select a valid tryout session.");
  return { fcpsId, name, grade, session };
}

function changedRecord(record, changes) {
  return {
    ...record,
    ...changes,
    revision: (Number(record.revision) || 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function createTryoutBoardHandler({ db, clientAddress }) {
  const privateCollection = db.collection("tryout_signups");
  const keyCollection = db.collection("tryout_student_keys");
  const publicCollection = db.collection("public_tryout_students");
  const limitCollection = db.collection("tryout_action_limits");

  async function reserveRateLimit(req) {
    const fingerprint = crypto.createHash("sha256").update(clientAddress(req) || "unknown").digest("hex");
    const bucket = Math.floor(Date.now() / 300000);
    const ref = limitCollection.doc(`${fingerprint}-${bucket}`);
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      const count = snap.exists ? Number(snap.data().count) || 0 : 0;
      if (count >= 600) throw new Error("Too many board updates. Please wait a moment and try again.");
      transaction.set(ref, { count: count + 1, expiresAtMs: (bucket + 2) * 300000 }, { merge: true });
    });
  }

  async function readAll(transaction) {
    const snapshot = await transaction.get(privateCollection.where("season", "==", SEASON));
    return new Map(snapshot.docs.map(doc => [doc.id, normalizeStoredRecord(doc.data())]));
  }

  function writeRecord(transaction, id, record) {
    transaction.set(privateCollection.doc(id), record, { merge: true });
    if (record.withdrawn) transaction.delete(publicCollection.doc(id));
    else transaction.set(publicCollection.doc(id), publicProjection(id, record), { merge: true });
  }

  async function open(body) {
    const identity = validateIdentity(body);
    const keyRef = keyCollection.doc(identityKey(identity.fcpsId));
    let response;
    await db.runTransaction(async transaction => {
      const keySnap = await transaction.get(keyRef);
      const id = keySnap.exists ? keySnap.data().studentId : crypto.randomUUID();
      const recordRef = privateCollection.doc(id);
      const recordSnap = keySnap.exists ? await transaction.get(recordRef) : null;
      const records = await readAll(transaction);
      const changed = new Map();
      let record = recordSnap && recordSnap.exists ? recordSnap.data() : null;
      if (!record) {
        record = {
          season: SEASON,
          name: identity.name,
          grade: identity.grade,
          session: identity.session,
          partnerId: null,
          partnerIds: [],
          pairedWith: null,
          withdrawn: false,
          releasedReason: "",
          revision: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
      } else {
        const sessionChanged = record.session !== identity.session;
        const formerPartnerId = sessionChanged ? record.pairedWith : null;
        record = changedRecord(record, {
          name: identity.name,
          grade: record.grade,
          session: identity.session,
          partnerId: sessionChanged ? null : record.partnerId || null,
          partnerIds: sessionChanged ? [] : normalizePreferenceIds(record),
          pairedWith: sessionChanged ? null : record.pairedWith || null,
          withdrawn: false,
          releasedReason: sessionChanged ? "" : record.releasedReason || "",
        });
        if (sessionChanged) {
          if (formerPartnerId) {
            const formerPartner = records.get(formerPartnerId);
            if (formerPartner && formerPartner.pairedWith === id) {
              const released = changedRecord(formerPartner, {
                partnerId: null,
                partnerIds: [],
                pairedWith: null,
                releasedReason: "",
              });
              records.set(formerPartnerId, released);
              changed.set(formerPartnerId, released);
            }
          }
          records.forEach((otherRecord, otherId) => {
            if (otherId === id || otherRecord.withdrawn || otherRecord.pairedWith) return;
            const remainingPreferences = remainingPreferenceIds(otherRecord, [id]);
            if (remainingPreferences.length !== normalizePreferenceIds(otherRecord).length) {
              const updated = changedRecord(otherRecord, {
                partnerId: remainingPreferences[0] || null,
                partnerIds: remainingPreferences,
                releasedReason: "",
              });
              records.set(otherId, updated);
              changed.set(otherId, updated);
            }
          });
        }
      }
      records.set(id, record);
      changed.set(id, record);
      if (!keySnap.exists) {
        transaction.set(keyRef, { studentId: id, season: SEASON, createdAt: FieldValue.serverTimestamp() });
      }
      changed.forEach((changedRecordValue, changedId) => writeRecord(transaction, changedId, changedRecordValue));
      response = privateView(id, record, records);
    });
    return response;
  }

  async function status(body) {
    const fcpsId = cleanText(body.fcpsId, 7);
    if (!validFcpsId(fcpsId)) throw new Error("Enter the student’s seven-digit FCPS ID.");
    const keySnap = await keyCollection.doc(identityKey(fcpsId)).get();
    if (!keySnap.exists) throw new Error("No signup was found for that FCPS ID.");
    const recordsSnap = await privateCollection.where("season", "==", SEASON).get();
    const records = new Map(recordsSnap.docs.map(doc => [doc.id, doc.data()]));
    const id = keySnap.data().studentId;
    const record = records.get(id);
    if (!record || record.withdrawn) throw new Error("No active signup was found for that FCPS ID.");
    return privateView(id, record, records);
  }

  async function mutate(body, action) {
    const fcpsId = cleanText(body.fcpsId, 7);
    if (!validFcpsId(fcpsId)) throw new Error("Enter the student’s seven-digit FCPS ID.");
    const keyRef = keyCollection.doc(identityKey(fcpsId));
    let response;
    await db.runTransaction(async transaction => {
      const keySnap = await transaction.get(keyRef);
      if (!keySnap.exists) throw new Error("No signup was found for that FCPS ID.");
      const selfId = keySnap.data().studentId;
      const records = await readAll(transaction);
      let self = records.get(selfId);
      if (!self || self.withdrawn) throw new Error("No active signup was found for that FCPS ID.");
      const expectedRevision = Number(body.expectedRevision);
      if (Number.isFinite(expectedRevision) && expectedRevision !== Number(self.revision || 0)) {
        throw new Error("Your signup changed on another device. The board has been refreshed.");
      }

      const changed = new Map();
      const releaseReferences = (studentId, reason) => {
        records.forEach((record, id) => {
          if (id === studentId || record.withdrawn || record.pairedWith) return;
          const currentPreferences = normalizePreferenceIds(record);
          if (currentPreferences.includes(studentId)) {
            const remainingPreferences = remainingPreferenceIds(record, [studentId]);
            const updated = changedRecord(record, {
              partnerId: remainingPreferences[0] || null,
              partnerIds: remainingPreferences,
              pairedWith: null,
              releasedReason: remainingPreferences.length ? "" : reason || "",
            });
            records.set(id, updated);
            changed.set(id, updated);
          }
        });
      };

      if (action === "request") {
        const requestedSession = cleanText(body.session, 8);
        if (!SESSIONS.has(requestedSession)) throw new Error("Select a valid tryout session.");
        if (requestedSession !== self.session) {
          const formerPartnerId = self.pairedWith;
          self = changedRecord(self, {
            session: requestedSession,
            partnerId: null,
            partnerIds: [],
            pairedWith: null,
            releasedReason: "",
          });
          records.set(selfId, self);
          changed.set(selfId, self);
          if (formerPartnerId) {
            const formerPartner = records.get(formerPartnerId);
            if (formerPartner && formerPartner.pairedWith === selfId) {
              const released = changedRecord(formerPartner, {
                partnerId: null,
                partnerIds: [],
                pairedWith: null,
                releasedReason: "",
              });
              records.set(formerPartnerId, released);
              changed.set(formerPartnerId, released);
            }
          }
          releaseReferences(selfId, "");
        }
        if (Array.isArray(body.partnerIds) && body.partnerIds.length > 4) {
          throw new Error("Choose no more than four preferred partners.");
        }
        const submittedPreferences = normalizePreferenceIds(body.partnerIds, body.partnerId);
        if (!submittedPreferences.length) throw new Error("Choose at least one preferred partner.");
        if (submittedPreferences.includes(selfId)) throw new Error("You cannot choose yourself as a partner.");

        const partners = submittedPreferences.map(partnerId => records.get(partnerId));
        if (partners.some(partner => !partner || partner.withdrawn || partner.session !== self.session)) {
          throw new Error("One of those students is no longer available for this session.");
        }
        if (partners.some(partner => partner.pairedWith && partner.pairedWith !== selfId)) {
          throw new Error("One of those students completed another pairing first. Choose another student.");
        }
        if (self.pairedWith && !submittedPreferences.includes(self.pairedWith)) {
          throw new Error("Release your current pairing before choosing someone else.");
        }

        if (self.pairedWith) {
          const confirmedPartner = records.get(self.pairedWith);
          self = changedRecord(self, {
            partnerId: self.pairedWith,
            partnerIds: submittedPreferences,
            pairedWith: self.pairedWith,
            releasedReason: "",
          });
          const partnerUpdate = changedRecord(confirmedPartner, {
            partnerId: selfId,
            partnerIds: normalizePreferenceIds(confirmedPartner),
            pairedWith: selfId,
            releasedReason: "",
          });
          records.set(selfId, self);
          records.set(self.pairedWith, partnerUpdate);
          changed.set(selfId, self);
          changed.set(self.pairedWith, partnerUpdate);
        } else {
          self = changedRecord(self, {
            partnerId: submittedPreferences[0],
            partnerIds: submittedPreferences,
            pairedWith: null,
            releasedReason: "",
          });
          records.set(selfId, self);
          changed.set(selfId, self);

          const matchedPartnerId = firstValidMutualPreference(selfId, self, records);
          if (matchedPartnerId) {
            const latestPartner = records.get(matchedPartnerId);
            self = changedRecord(self, { partnerId: matchedPartnerId, pairedWith: matchedPartnerId });
            const pairedPartner = changedRecord(latestPartner, { partnerId: selfId, pairedWith: selfId });
            records.set(selfId, self);
            records.set(matchedPartnerId, pairedPartner);
            changed.set(selfId, self);
            changed.set(matchedPartnerId, pairedPartner);
            records.forEach((record, id) => {
              if (id === selfId || id === matchedPartnerId || record.withdrawn || record.pairedWith) return;
              const currentPreferences = normalizePreferenceIds(record);
              if (currentPreferences.includes(selfId) || currentPreferences.includes(matchedPartnerId)) {
                const remainingPreferences = remainingPreferenceIds(record, [selfId, matchedPartnerId]);
                const released = changedRecord(record, {
                  partnerId: remainingPreferences[0] || null,
                  partnerIds: remainingPreferences,
                  pairedWith: null,
                  releasedReason: remainingPreferences.length ? "" : "partner-locked",
                });
                records.set(id, released);
                changed.set(id, released);
              }
            });
          }
        }
      } else if (action === "release" || action === "withdraw") {
        const formerPartnerId = self.pairedWith;
        self = changedRecord(self, {
          partnerId: null,
          partnerIds: [],
          pairedWith: null,
          releasedReason: "",
          withdrawn: action === "withdraw",
        });
        records.set(selfId, self);
        changed.set(selfId, self);
        if (formerPartnerId) {
          const formerPartner = records.get(formerPartnerId);
          if (formerPartner && formerPartner.pairedWith === selfId) {
            const released = changedRecord(formerPartner, {
              partnerId: null,
              partnerIds: [],
              pairedWith: null,
              releasedReason: "",
            });
            records.set(formerPartnerId, released);
            changed.set(formerPartnerId, released);
          }
        }
        releaseReferences(selfId, "");
      } else {
        throw new Error("Unsupported board action.");
      }

      changed.forEach((record, id) => writeRecord(transaction, id, record));
      response = action === "withdraw" ? null : privateView(selfId, records.get(selfId), records);
    });
    return response;
  }

  return async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed." });
      return;
    }
    try {
      await reserveRateLimit(req);
      const body = req.body || {};
      const action = cleanText(body.action, 20);
      const self = action === "open" ? await open(body) : action === "status" ? await status(body) : await mutate(body, action);
      res.status(200).json({ ok: true, self });
    } catch (error) {
      const message = error && error.message ? error.message : "The tryout board is temporarily unavailable.";
      console.error("tryoutBoard request failed:", { action: cleanText(req.body?.action, 20), message });
      res.status(400).json({ error: message });
    }
  };
}

module.exports = {
  SEASON,
  createTryoutBoardHandler,
  displayName,
  firstValidMutualPreference,
  identityKey,
  normalizePreferenceIds,
  remainingPreferenceIds,
  validFcpsId,
};
