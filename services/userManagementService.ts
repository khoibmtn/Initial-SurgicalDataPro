// ─── User Management Service ──────────────────────────────────────────────────
// Admin-only service: quản lý tất cả users, approve/disable, role changes

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
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

// ─── Update user profile fields (department, displayName, role) ──────────────

export async function updateUserProfile(
  uid: string,
  fields: { department?: string; displayName?: string; role?: UserRole }
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { ...fields, updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Delete user (Admin only) ───────────────────────────────────────────────

export async function deleteUser(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Reset user password to default '123456' ─────────────────────────────────

export async function resetUserPassword(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, {
      passwordResetDefault: true,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Reject (disable) a pending user ────────────────────────────────────────

export async function rejectUser(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { status: 'disabled', updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Batch Approve Users (Atomic Batch) ─────────────────────────────────────

export async function batchApproveUsers(
  uids: string[],
  departmentMap?: Record<string, string>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!uids || uids.length === 0) return { success: true, count: 0 };
  try {
    const batch = writeBatch(firestore);
    for (const uid of uids) {
      const docRef = doc(firestore, USERS_COLLECTION, uid);
      const updateData: Record<string, any> = {
        status: 'active',
        updatedAt: serverTimestamp(),
      };
      if (departmentMap && departmentMap[uid]) {
        updateData.department = departmentMap[uid];
      }
      batch.update(docRef, updateData);
    }
    await batch.commit();
    return { success: true, count: uids.length };
  } catch (err: any) {
    console.error('[userManagementService] batchApproveUsers error:', err);
    return { success: false, count: 0, error: err.message };
  }
}

// ─── Batch Reject Users (Atomic Batch) ──────────────────────────────────────

export async function batchRejectUsers(
  uids: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!uids || uids.length === 0) return { success: true, count: 0 };
  try {
    const batch = writeBatch(firestore);
    for (const uid of uids) {
      const docRef = doc(firestore, USERS_COLLECTION, uid);
      batch.update(docRef, {
        status: 'disabled',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return { success: true, count: uids.length };
  } catch (err: any) {
    console.error('[userManagementService] batchRejectUsers error:', err);
    return { success: false, count: 0, error: err.message };
  }
}

// ─── Subscribe to Pending Users (Realtime count & list for Approver) ────────

export function subscribeToPendingUsers(
  role: 'admin' | 'head' | 'deputy_head',
  department: string | undefined,
  callback: (users: AppUser[]) => void
): Unsubscribe {
  if (role === 'admin') {
    const q = query(
      collection(firestore, USERS_COLLECTION),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const users = snapshot.docs.map((d) => docToAppUser(d.id, d.data()));
        callback(users);
      },
      (err) => {
        console.error('[userManagementService] subscribeToPendingUsers (admin) error:', err);
        callback([]);
      }
    );
  } else if ((role === 'head' || role === 'deputy_head') && department) {
    const q = query(
      collection(firestore, USERS_COLLECTION),
      where('department', '==', department),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const users = snapshot.docs.map((d) => docToAppUser(d.id, d.data()));
        callback(users);
      },
      (err) => {
        console.error('[userManagementService] subscribeToPendingUsers (head) error:', err);
        callback([]);
      }
    );
  }

  callback([]);
  return () => {};
}

