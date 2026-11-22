import { initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
  doc,
  Firestore,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { GrimoireSnapshot } from "../types/spell";
import {
  sanitizeConcentrationSpell,
  sanitizeConfig,
  sanitizeRingSpells,
  sanitizeRollHistory,
  sanitizeSpellSlots,
  sanitizeStringList,
} from "./spellEngine";

interface FirebaseAppletConfig {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const configModules = import.meta.glob<{ default: FirebaseAppletConfig }>(
  "../../firebase-applet-config.json",
  { eager: true }
);

const rawConfig: FirebaseAppletConfig | undefined =
  Object.values(configModules)[0]?.default;

const cloudSyncDisabledByEnv =
  import.meta.env.VITE_DISABLE_CLOUD_SYNC === "true";

const hasValidConfig = Boolean(
  !cloudSyncDisabledByEnv &&
    rawConfig &&
    rawConfig.apiKey &&
    rawConfig.projectId &&
    rawConfig.projectId !== "remixed-project-id"
);

let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (hasValidConfig && rawConfig) {
  try {
    const app = initializeApp(rawConfig);
    dbInstance = rawConfig.firestoreDatabaseId
      ? getFirestore(app, rawConfig.firestoreDatabaseId)
      : getFirestore(app);
    authInstance = getAuth(app);
  } catch (err) {
    console.warn("Firebase initialization skipped:", err);
    dbInstance = null;
    authInstance = null;
  }
}

export const db = dbInstance;
export const auth = authInstance;
export const isCloudSyncConfigured = Boolean(dbInstance && authInstance);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isUnauthorizedDomainError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return (
    code === "auth/unauthorized-domain" ||
    (typeof message === "string" && message.includes("unauthorized-domain"))
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export async function loadCloudGrimoire(
  uid: string
): Promise<GrimoireSnapshot | null> {
  if (!db) return null;
  const docPath = `grimoireSaves/${uid}`;
  try {
    const snap = await getDoc(doc(db, "grimoireSaves", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const updatedTs = data.updatedAt as Timestamp | undefined;
    const cleanConfig = sanitizeConfig(data.config);
    return {
      knownSpellNames: sanitizeStringList(data.knownSpellNames, 400),
      rolledSpellNames: sanitizeStringList(data.rolledSpellNames, 100),
      ringSpells: sanitizeRingSpells(data.ringSpells),
      spellSlots: sanitizeSpellSlots(data.spellSlots, cleanConfig.casterLevel),
      concentrationSpell: sanitizeConcentrationSpell(data.concentrationSpell),
      rollHistory: sanitizeRollHistory(data.rollHistory),
      config: cleanConfig,
      updatedAt: updatedTs?.toDate
        ? updatedTs.toDate().toISOString()
        : new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function saveCloudGrimoire(
  uid: string,
  snapshot: GrimoireSnapshot
): Promise<void> {
  if (!db) return;
  const docPath = `grimoireSaves/${uid}`;
  const docRef = doc(db, "grimoireSaves", uid);
  const sanitizedKnown = sanitizeStringList(snapshot.knownSpellNames, 400);
  const sanitizedRolled = sanitizeStringList(snapshot.rolledSpellNames, 100);
  const sanitizedRing = sanitizeRingSpells(snapshot.ringSpells);
  const sanitizedConfig = sanitizeConfig(snapshot.config);
  const sanitizedSlots = sanitizeSpellSlots(
    snapshot.spellSlots,
    sanitizedConfig.casterLevel
  );
  const sanitizedConcentration = sanitizeConcentrationSpell(
    snapshot.concentrationSpell
  );
  const sanitizedHistory = sanitizeRollHistory(snapshot.rollHistory);

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        knownSpellNames: sanitizedKnown,
        rolledSpellNames: sanitizedRolled,
        ringSpells: sanitizedRing,
        spellSlots: sanitizedSlots,
        concentrationSpell: sanitizedConcentration,
        rollHistory: sanitizedHistory,
        config: sanitizedConfig,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ownerId: uid,
        knownSpellNames: sanitizedKnown,
        rolledSpellNames: sanitizedRolled,
        ringSpells: sanitizedRing,
        spellSlots: sanitizedSlots,
        concentrationSpell: sanitizedConcentration,
        rollHistory: sanitizedHistory,
        config: sanitizedConfig,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function loadLegacyPermanentSpells(
  uid: string
): Promise<string[] | null> {
  if (!db) return null;
  const docPath = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!Array.isArray(data.permanentSpellNames)) return null;
    return sanitizeStringList(data.permanentSpellNames, 400);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}
