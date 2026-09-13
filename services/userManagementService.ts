// ─── User Management Service ──────────────────────────────────────────────────
// Admin-only service: quản lý tất cả users, approve/disable, role changes

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { ref, update, set, onValue } from 'firebase/database';
import { firestore, db } from '../lib/firebase';
import type { AppUser, UserRole, UserStatus, AuthConfig } from '../types/auth';
import { Timestamp } from 'firebase/firestore';

const USERS_COLLECTION = 'users';

// ─── Helper: Convert Firestore doc → AppUser ────────────────────────────────

function docToAppUser(uid: string, data: Record<string, any>): AppUser {
  return {
    uid,
    nickname: data.nickname || '',
    displayName: data.displayName || data.nickname || '',
    email: data.email || '',
    role: (data.role as UserRole) || 'staff',
    department: data.department || '',
    status: (data.status as UserStatus) || 'pending',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt || Date.now()),
    permissions: data.permissions || [],
  };
}

// ─── Get all users ──────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<AppUser[]> {
  try {
    const q = query(collection(firestore, USERS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => docToAppUser(d.id, d.data()));
  } catch (err) {
    console.error('[userManagementService] getAllUsers error:', err);
    return [];
  }
}

// ─── Subscribe to all users (realtime) ──────────────────────────────────────

export function subscribeToAllUsers(callback: (users: AppUser[]) => void): Unsubscribe {
  const q = query(collection(firestore, USERS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((d) => docToAppUser(d.id, d.data()));
    callback(users);
  }, (err) => {
    console.error('[userManagementService] subscribeToAllUsers error:', err);
    callback([]);
  });
}

// ─── Approve user ───────────────────────────────────────────────────────────

export async function approveUser(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { status: 'active', updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Disable user ───────────────────────────────────────────────────────────

export async function disableUser(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { status: 'disabled', updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Enable user (re-activate) ──────────────────────────────────────────────

export async function enableUser(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { status: 'active', updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Change user role ───────────────────────────────────────────────────────

export async function changeUserRole(uid: string, role: UserRole): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { role, updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Update auth config (Realtime Database) ─────────────────────────────────

export async function updateAuthConfig(config: Partial<AuthConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const configRef = ref(db, 'auth_config');
    await update(configRef, config);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Subscribe to users in a specific department (realtime for Head) ────────
export function subscribeToDepartmentUsers(
  department: string,
  callback: (users: AppUser[]) => void
): Unsubscribe {
  if (!department) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(firestore, USERS_COLLECTION),
    where('department', '==', department),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((d) => docToAppUser(d.id, d.data()));
    callback(users);
  }, (err) => {
    console.error('[userManagementService] subscribeToDepartmentUsers error:', err);
    callback([]);
  });
}

// ─── Department-specific Staff Permissions ──────────────────────────────────
export async function saveDepartmentStaffPermissions(
  department: string,
  permissions: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const safeDeptKey = encodeURIComponent(department.trim()).replace(/\./g, '_');
    const deptPermRef = ref(db, `department_permissions/${safeDeptKey}/staff`);
    await set(deptPermRef, permissions);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function subscribeToDepartmentPermissions(
  department: string,
  callback: (permissions: string[] | null) => void
): () => void {
  if (!department) {
    callback(null);
    return () => {};
  }
  const safeDeptKey = encodeURIComponent(department.trim()).replace(/\./g, '_');
  const deptPermRef = ref(db, `department_permissions/${safeDeptKey}/staff`);
  return onValue(deptPermRef, (snapshot) => {
    const data = snapshot.val();
    callback(Array.isArray(data) ? data : null);
  }, (err) => {
    console.error('[userManagementService] subscribeToDepartmentPermissions error:', err);
    callback(null);
  });
}

