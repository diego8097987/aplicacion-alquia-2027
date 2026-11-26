import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';
import { formatFriendlyErrorMessage, logAppError } from '../utils/errorHandler';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || appletConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId || undefined,
};

export const firestoreDatabaseId =
  env.VITE_FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

function createRealtimeFirestore(): Firestore {
  const settings = {
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  };
  try {
    return firestoreDatabaseId && firestoreDatabaseId !== '(default)'
      ? initializeFirestore(app, settings, firestoreDatabaseId)
      : initializeFirestore(app, settings);
  } catch {
    return firestoreDatabaseId && firestoreDatabaseId !== '(default)'
      ? getFirestore(app, firestoreDatabaseId)
      : getFirestore(app);
  }
}

export const db = createRealtimeFirestore();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
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
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  logAppError({
    source: 'firestore',
    action: `firestore:${operationType}`,
    severity: 'error',
    code: `FIRESTORE_${operationType.toUpperCase()}`,
    error: error instanceof Error ? error : new Error(errInfo.error),
    userMessage: formatFriendlyErrorMessage(new Error(JSON.stringify(errInfo))),
    context: {
      path,
      operationType,
      userId: errInfo.authInfo.userId,
      email: errInfo.authInfo.email,
    },
  });
  throw new Error(JSON.stringify(errInfo));
}

export interface ConnectionCheckResult {
  connected: boolean;
  projectId: string;
  databaseId: string;
  latencyMs: number;
  error?: string;
}

export async function testConnection(): Promise<ConnectionCheckResult> {
  const started = Date.now();
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      databaseId: firestoreDatabaseId,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      logAppError({
        source: 'firestore',
        action: 'testConnection',
        severity: 'warning',
        code: 'FIRESTORE_OFFLINE',
        error,
        userMessage: 'Sin conexión al servidor de Firestore (client is offline).',
        context: { projectId: firebaseConfig.projectId, databaseId: firestoreDatabaseId },
      });
      return {
        connected: false,
        projectId: firebaseConfig.projectId,
        databaseId: firestoreDatabaseId,
        latencyMs: Date.now() - started,
        error: 'Sin conexión al servidor de Firestore (client is offline).',
      };
    }
    // Missing/insufficient permissions on test/connection confirms live server reachability
    return {
      connected: true,
      projectId: firebaseConfig.projectId,
      databaseId: firestoreDatabaseId,
      latencyMs: Date.now() - started,
    };
  }
}

void testConnection();
