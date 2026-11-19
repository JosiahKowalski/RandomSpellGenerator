import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { GrimoireSnapshot } from "../types/spell";
import { sanitizeConfig, sanitizeStringList } from "./spellEngine";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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
  const docPath = `grimoireSaves/${uid}`;
  try {
    const snap = await getDoc(doc(db, "grimoireSaves", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const updatedTs = data.updatedAt as Timestamp | undefined;
    return {
      knownSpellNames: sanitizeStringList(data.knownSpellNames, 400),
      rolledSpellNames: sanitizeStringList(data.rolledSpellNames, 100),
      config: sanitizeConfig(data.config),
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
  const docPath = `grimoireSaves/${uid}`;
  const docRef = doc(db, "grimoireSaves", uid);
  const sanitizedKnown = sanitizeStringList(snapshot.knownSpellNames, 400);
  const sanitizedRolled = sanitizeStringList(snapshot.rolledSpellNames, 100);
  const sanitizedConfig = sanitizeConfig(snapshot.config);

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        knownSpellNames: sanitizedKnown,
        rolledSpellNames: sanitizedRolled,
        config: sanitizedConfig,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ownerId: uid,
        knownSpellNames: sanitizedKnown,
        rolledSpellNames: sanitizedRolled,
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
