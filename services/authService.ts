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
  isValidPhoneNumber,
} from '../types/auth';
import { logAuditEvent } from './auditLogService';

const USERS_COLLECTION = 'users';

// ─── Helper: Convert Firestore doc → AppUser ────────────────────────────────

function docToAppUser(uid: string, data: Record<string, any>): AppUser {
  return {
    uid,
    nickname: data.nickname || '',
    displayName: data.displayName || data.nickname || '',
    email: data.email || '',
    phone: data.phone ? String(data.phone).trim() : undefined,
    role: (data.role as UserRole) || 'staff',
    department: data.department || '',
    status: (data.status as UserStatus) || 'pending',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt || Date.now()),
    permissions: data.permissions || [],
  };
}

// ─── Helper: Kiểm tra trùng số điện thoại ───────────────────────────────────

export async function checkPhoneExists(phone: string, excludeUid?: string): Promise<boolean> {
  const cleanPhone = (phone || '').trim();
  if (!cleanPhone) return false;
  try {
    const q = query(
      collection(firestore, USERS_COLLECTION),
      where('phone', '==', cleanPhone)
    );
    const snap = await getDocs(q);
    if (snap.empty) return false;
    if (excludeUid) {
      return snap.docs.some((d) => d.id !== excludeUid);
    }
    return true;
  } catch (err) {
    console.error('[authService] checkPhoneExists error:', err);
    return false;
  }
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
      // Ghi audit log đăng nhập
      logAuditEvent({
        userId: newUser.uid,
        userName: newUser.displayName || newUser.nickname,
        userRole: newUser.role,
        userDepartment: newUser.department,
        action: 'USER_LOGIN',
        targetType: 'user',
        targetId: newUser.uid,
        targetLabel: `${newUser.displayName} (${newUser.email})`,
        description: 'Quản trị viên đăng nhập vào hệ thống',
      }).catch((e) => console.warn('[auditLog] Failed to log admin login:', e));

      return { success: true, user: newUser };
    }
    if (profile.status === 'disabled') {
      await signOut(auth);
      return { success: false, error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' };
    }

    // Ghi audit log đăng nhập
    logAuditEvent({
      userId: profile.uid,
      userName: profile.displayName || profile.nickname,
      userRole: profile.role,
      userDepartment: profile.department,
      action: 'USER_LOGIN',
      targetType: 'user',
      targetId: profile.uid,
      targetLabel: `${profile.displayName} (${profile.email})`,
      description: 'Quản trị viên đăng nhập vào hệ thống',
    }).catch((e) => console.warn('[auditLog] Failed to log admin login:', e));

    return { success: true, user: profile };
  } catch (err: any) {
    return { success: false, error: mapFirebaseError(err.code) };
  }
}

// ─── Đăng nhập bằng nickname hoặc số điện thoại (dành cho nhân viên) ───────────

export async function loginWithNickname(identifier: string, password: string): Promise<AuthResult> {
  try {
    const rawInput = identifier.trim();
    let email = '';
    let isPhoneLogin = false;
    let foundNickname = '';

    // Nhận diện nếu identifier là số điện thoại (10 chữ số bắt đầu bằng 0)
    if (/^0[0-9]{9}$/.test(rawInput)) {
      isPhoneLogin = true;
      const q = query(
        collection(firestore, USERS_COLLECTION),
        where('phone', '==', rawInput)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        return { success: false, error: 'Số điện thoại này chưa được đăng ký trong hệ thống.' };
      }
      const userDoc = snap.docs[0];
      const userData = userDoc.data();
      foundNickname = userData.nickname || '';
      email = userData.email || nicknameToEmail(foundNickname);
    } else {
      foundNickname = rawInput.toLowerCase();
      email = nicknameToEmail(foundNickname);
    }
    
    try {
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

      // Xóa cờ resetPasswordDefault nếu đang có
      if ((profile as any).passwordResetDefault) {
        const docRef = doc(firestore, USERS_COLLECTION, credential.user.uid);
        updateDoc(docRef, { passwordResetDefault: false }).catch(() => {});
      }

      // Ghi audit log đăng nhập
      logAuditEvent({
        userId: profile.uid,
        userName: profile.displayName || profile.nickname,
        userRole: profile.role,
        userDepartment: profile.department,
        action: 'USER_LOGIN',
        targetType: 'user',
        targetId: profile.uid,
        targetLabel: `${profile.displayName} (${profile.nickname})`,
        description: `Đăng nhập vào hệ thống (${isPhoneLogin ? `qua SĐT: ${rawInput}` : `qua nickname: ${foundNickname}`})`,
      }).catch((e) => console.warn('[auditLog] Failed to log user login:', e));
      
      return { success: true, user: profile };
    } catch (authErr: any) {
      // Hỗ trợ mật khẩu reset về 123456 do Admin thực hiện
      if (password === '123456') {
        let q;
        if (isPhoneLogin) {
          q = query(
            collection(firestore, USERS_COLLECTION),
            where('phone', '==', rawInput)
          );
        } else {
          q = query(
            collection(firestore, USERS_COLLECTION),
            where('nickname', '==', foundNickname)
          );
        }
        const snap = await getDocs(q);
        if (!snap.empty) {
          const userDoc = snap.docs[0];
          const userData = userDoc.data();
          if (userData.passwordResetDefault === true) {
            const profile = docToAppUser(userDoc.id, userData);
            if (profile.status === 'pending') {
              return { success: false, error: 'Tài khoản đang chờ phê duyệt.' };
            }
            if (profile.status === 'disabled') {
              return { success: false, error: 'Tài khoản đã bị khóa.' };
            }

            // Ghi audit log đăng nhập
            logAuditEvent({
              userId: profile.uid,
              userName: profile.displayName || profile.nickname,
              userRole: profile.role,
              userDepartment: profile.department,
              action: 'USER_LOGIN',
              targetType: 'user',
              targetId: profile.uid,
              targetLabel: `${profile.displayName} (${profile.nickname})`,
              description: `Đăng nhập mật khẩu mặc định (${isPhoneLogin ? `SĐT: ${rawInput}` : `nickname: ${foundNickname}`})`,
            }).catch((e) => console.warn('[auditLog] Failed to log reset password login:', e));

            return { success: true, user: profile };
          }
        }
      }
      return { success: false, error: mapFirebaseError(authErr.code) };
    }
  } catch (err: any) {
    return { success: false, error: mapFirebaseError(err.code) };
  }
}

// ─── Đăng ký tài khoản mới (nickname-based kèm số điện thoại) ───────────────

export async function registerWithNickname(
  data: RegisterData,
  requireApproval: boolean = true,
): Promise<AuthResult> {
  try {
    const normalizedNickname = data.nickname.toLowerCase().trim();
    const cleanPhone = (data.phone || '').trim();

    // 1. Validate phone
    if (!cleanPhone) {
      return { success: false, error: 'Số điện thoại là bắt buộc khi đăng ký.' };
    }
    if (!isValidPhoneNumber(cleanPhone)) {
      return { success: false, error: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số di động (bắt đầu bằng 03, 05, 07, 08, 09).' };
    }

    // 2. Kiểm tra trùng số điện thoại
    const phoneTaken = await checkPhoneExists(cleanPhone);
    if (phoneTaken) {
      return { success: false, error: `Số điện thoại "${cleanPhone}" đã được đăng ký bởi tài khoản khác.` };
    }
    
    // 3. Validate nickname format
    if (normalizedNickname.length < 6) {
      return { success: false, error: 'Nickname phải có ít nhất 6 ký tự.' };
    }
    
    if (!/^[a-z0-9._-]+$/.test(normalizedNickname)) {
      return { success: false, error: 'Nickname chỉ được chứa chữ thường, số, dấu chấm, gạch ngang và gạch dưới.' };
    }
    
    // 4. Create Firebase Auth user first
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
    
    // 5. Create Firestore user doc (now authenticated, so rules allow create)
    const status: UserStatus = requireApproval ? 'pending' : 'active';
    const newUser = await createUserDoc(credential.user.uid, {
      nickname: normalizedNickname,
      displayName: data.displayName || normalizedNickname,
      email,
      phone: cleanPhone,
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

export async function logout(currentUser?: AppUser | null): Promise<void> {
  if (currentUser) {
    logAuditEvent({
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.nickname,
      userRole: currentUser.role,
      userDepartment: currentUser.department,
      action: 'USER_LOGOUT',
      targetType: 'user',
      targetId: currentUser.uid,
      targetLabel: `${currentUser.displayName} (${currentUser.nickname})`,
      description: 'Đăng xuất khỏi hệ thống',
    }).catch((e) => console.warn('[auditLog] Failed to log logout:', e));
  }
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
    phone?: string;
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

/** Cập nhật số điện thoại cho tài khoản (có kiểm tra tính duy nhất) */
export async function updateUserPhone(uid: string, phone: string): Promise<{ success: boolean; error?: string }> {
  const cleanPhone = (phone || '').trim();
  if (!cleanPhone) {
    return { success: false, error: 'Số điện thoại không được để trống.' };
  }
  if (!isValidPhoneNumber(cleanPhone)) {
    return { success: false, error: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số di động (bắt đầu bằng 03, 05, 07, 08, 09).' };
  }
  const isDuplicate = await checkPhoneExists(cleanPhone, uid);
  if (isDuplicate) {
    return { success: false, error: `Số điện thoại "${cleanPhone}" đã được sử dụng bởi tài khoản khác.` };
  }
  try {
    const docRef = doc(firestore, USERS_COLLECTION, uid);
    await updateDoc(docRef, {
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi cập nhật số điện thoại.' };
  }
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<AppUser, 'displayName' | 'department' | 'phone'>>,
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
