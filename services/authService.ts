// ─── Auth Service ─────────────────────────────────────────────────────────────
// Firebase Auth + Firestore user profile CRUD
// Hỗ trợ 2 chế độ đăng nhập: email (admin) và nickname (nhân viên)

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  type Unsubscribe,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  collection,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import {
  type AppUser,
  type UserRole,
  type UserStatus,
  type RegisterData,
  type AuthResult,
  nicknameToEmail,
} from '../types/auth';

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

// ─── Đăng nhập bằng email (dành cho Admin) ──────────────────────────────────

export async function loginWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);
    if (!profile) {
      // User đã có Firebase Auth nhưng chưa có doc Firestore → tạo doc admin
      const newUser = await createUserDoc(credential.user.uid, {
        nickname: email.split('@')[0],
        displayName: email.split('@')[0],
        email,
        role: 'admin',
        department: 'Quản trị',
        status: 'active',
      });
      return { success: true, user: newUser };
    }
    if (profile.status === 'disabled') {
      await signOut(auth);
      return { success: false, error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' };
    }
    return { success: true, user: profile };
  } catch (err: any) {
    return { success: false, error: mapFirebaseError(err.code) };
  }
}

// ─── Đăng nhập bằng nickname (dành cho nhân viên) ───────────────────────────

export async function loginWithNickname(nickname: string, password: string): Promise<AuthResult> {
  try {
    const normalizedNickname = nickname.toLowerCase().trim();
    
    // Tạo email ảo từ nickname
    const email = nicknameToEmail(normalizedNickname);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);
    
    if (!profile) {
      await signOut(auth);
      return { success: false, error: 'Không tìm thấy hồ sơ người dùng.' };
    }
    
    if (profile.status === 'pending') {
      await signOut(auth);
      return { success: false, error: 'Tài khoản đang chờ phê duyệt. Vui lòng liên hệ quản trị viên hoặc trưởng khoa.' };
    }
    
    if (profile.status === 'disabled') {
      await signOut(auth);
      return { success: false, error: 'Tài khoản đã bị khóa.' };
    }
    
    return { success: true, user: profile };
  } catch (err: any) {
    return { success: false, error: mapFirebaseError(err.code) };
  }
}

// ─── Đăng ký tài khoản mới (nickname-based) ─────────────────────────────────

export async function registerWithNickname(
  data: RegisterData,
  requireApproval: boolean = true,
): Promise<AuthResult> {
  try {
    const normalizedNickname = data.nickname.toLowerCase().trim();
    
    // Validate nickname format
    if (normalizedNickname.length < 6) {
      return { success: false, error: 'Nickname phải có ít nhất 6 ký tự.' };
    }
    
    if (!/^[a-z0-9._-]+$/.test(normalizedNickname)) {
      return { success: false, error: 'Nickname chỉ được chứa chữ thường, số, dấu chấm, gạch ngang và gạch dưới.' };
    }
    
    // Create Firebase Auth user first
    // nickname → email is deterministic, so email-already-in-use = nickname taken
    const email = nicknameToEmail(normalizedNickname);
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, email, data.password);
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-in-use') {
        return { success: false, error: 'Nickname này đã được sử dụng. Vui lòng chọn nickname khác.' };
      }
      return { success: false, error: mapFirebaseError(authErr.code) };
    }
    
    // Create Firestore user doc (now authenticated, so rules allow create)
    const status: UserStatus = requireApproval ? 'pending' : 'active';
    const newUser = await createUserDoc(credential.user.uid, {
      nickname: normalizedNickname,
      displayName: data.displayName || normalizedNickname,
      email,
      role: 'staff',
      department: data.department,
      status,
    });
    
    // Nếu cần phê duyệt, sign out ngay để chờ duyệt
    if (requireApproval) {
      await signOut(auth);
    }
    
    return { success: true, user: newUser };
  } catch (err: any) {
    return { success: false, error: mapFirebaseError(err.code) };
  }
}

// ─── Đăng xuất ──────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await signOut(auth);
}

// ─── User Profile CRUD ──────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return docToAppUser(uid, docSnap.data());
  } catch (err) {
    console.error('[authService] getUserProfile error:', err);
    return null;
  }
}

async function createUserDoc(
  uid: string,
  data: {
    nickname: string;
    displayName: string;
    email: string;
    role: UserRole;
    department: string;
    status: UserStatus;
  },
): Promise<AppUser> {
  const docRef = doc(firestore, USERS_COLLECTION, uid);
  const userData = {
    ...data,
    permissions: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(docRef, userData);
  
  return {
    uid,
    ...data,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<AppUser, 'displayName' | 'department'>>,
): Promise<AuthResult> {
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─── Nickname Availability Check ────────────────────────────────────────────

export async function isNicknameAvailable(nickname: string): Promise<boolean> {
  try {
    const q = query(
      collection(firestore, USERS_COLLECTION),
      where('nickname', '==', nickname.toLowerCase().trim()),
    );
    const snapshot = await getDocs(q);
    return snapshot.empty;
  } catch (err) {
    console.error('[authService] isNicknameAvailable error:', err);
    return false; // Fail-closed: nếu lỗi thì coi như đã tồn tại
  }
}

// ─── Auth State Listener ────────────────────────────────────────────────────

export function onAuthChange(callback: (user: FirebaseUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

// ─── Realtime User Profile Listener ─────────────────────────────────────────

export function subscribeToUserProfile(
  uid: string,
  callback: (user: AppUser | null) => void,
): Unsubscribe {
  const docRef = doc(firestore, USERS_COLLECTION, uid);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback(docToAppUser(uid, snap.data()));
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('[authService] subscribeToUserProfile error:', err);
    callback(null);
  });
}

// ─── Firebase Error Mapping (tiếng Việt) ────────────────────────────────────

function mapFirebaseError(code: string): string {
  const errorMap: Record<string, string> = {
    'auth/user-not-found': 'Tài khoản không tồn tại.',
    'auth/wrong-password': 'Mật khẩu không đúng.',
    'auth/invalid-credential': 'Thông tin đăng nhập không hợp lệ.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/email-already-in-use': 'Nickname này đã được sử dụng.',
    'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự.',
    'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng đợi vài phút.',
    'auth/network-request-failed': 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
  };
  return errorMap[code] || `Lỗi đăng nhập: ${code}`;
}
