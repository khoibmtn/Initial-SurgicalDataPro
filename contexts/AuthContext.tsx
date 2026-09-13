// ─── Auth Context ─────────────────────────────────────────────────────────────
// Provider quản lý trạng thái đăng nhập toàn app
// Khi chưa đăng nhập → Guest mode (app hoạt động y hệt hiện tại)

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AppUser, AuthState, AuthConfig, RegisterData, AuthResult } from '../types/auth';
import {
  loginWithEmail,
  loginWithNickname,
  registerWithNickname,
  logout as authLogout,
  getUserProfile,
  onAuthChange,
  subscribeToUserProfile,
} from '../services/authService';
import { subscribeToPendingUsers } from '../services/userManagementService';
import { sendNotification } from '../services/notificationService';
import { ref, onValue } from 'firebase/database';
import { db } from '../lib/firebase';

// ─── Default auth config (Guest-First: không bắt buộc login) ────────────────
const DEFAULT_AUTH_CONFIG: AuthConfig = {
  requireLogin: false,
  requireApproval: true,
  guestDisabled: false,
};

// ─── Context Types ──────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  /** Auth config từ Firebase RTDB */
  authConfig: AuthConfig;
  /** Đăng nhập bằng email (admin) */
  login: (email: string, password: string) => Promise<AuthResult>;
  /** Đăng nhập bằng nickname (nhân viên) */
  loginNickname: (nickname: string, password: string) => Promise<AuthResult>;
  /** Đăng ký tài khoản mới */
  register: (data: RegisterData) => Promise<AuthResult>;
  /** Đăng xuất */
  logout: () => Promise<void>;
  /** Vai trò hiện tại (guest nếu chưa login) */
  currentRole: AppUser['role'] | 'guest';
  /** Kiểm tra có phải admin không */
  isAdmin: boolean;
  /** Kiểm tra có phải trưởng khoa không */
  isHead: boolean;
  /** Kiểm tra có phải admin hoặc trưởng khoa không */
  isHeadOrAdmin: boolean;
  /** Số lượng tài khoản đang chờ duyệt thuộc thẩm quyền (admin: toàn viện, head: khoa mình) */
  pendingApprovalCount: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isPendingApproval: false,
  });
  const [authConfig, setAuthConfig] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);
  const profileUnsubRef = useRef<(() => void) | null>(null);

  // ── Lắng nghe số lượng tài khoản chờ duyệt (realtime badge) ──
  useEffect(() => {
    const user = authState.user;
    if (!user || user.status !== 'active') {
      setPendingApprovalCount(0);
      return;
    }

    if (user.role === 'admin') {
      const unsub = subscribeToPendingUsers('admin', undefined, (pendingList) => {
        setPendingApprovalCount(pendingList.length);
      });
      return () => unsub();
    } else if (user.role === 'head' && user.department) {
      const unsub = subscribeToPendingUsers('head', user.department, (pendingList) => {
        setPendingApprovalCount(pendingList.length);
      });
      return () => unsub();
    } else {
      setPendingApprovalCount(0);
    }
  }, [authState.user?.role, authState.user?.department, authState.user?.status]);

  // ── Lắng nghe auth_config từ Realtime Database ──
  useEffect(() => {
    const configRef = ref(db, 'auth_config');
    const unsub = onValue(configRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAuthConfig({
          requireLogin: data.requireLogin ?? DEFAULT_AUTH_CONFIG.requireLogin,
          requireApproval: data.requireApproval ?? DEFAULT_AUTH_CONFIG.requireApproval,
          guestDisabled: data.guestDisabled ?? DEFAULT_AUTH_CONFIG.guestDisabled,
        });
      }
    }, (err) => {
      console.warn('[AuthContext] auth_config listener error:', err);
    });
    return () => unsub();
  }, []);

  // ── Lắng nghe Firebase Auth state ──
  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      // Cleanup previous profile listener
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      if (!firebaseUser) {
        // Chưa đăng nhập → Guest mode
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isPendingApproval: false,
        });
        return;
      }

      // Đã đăng nhập → lấy profile từ Firestore
      try {
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          setAuthState({
            user: profile,
            isLoading: false,
            isAuthenticated: profile.status === 'active',
            isPendingApproval: profile.status === 'pending',
          });

          // Subscribe realtime profile updates (role/status changes)
          profileUnsubRef.current = subscribeToUserProfile(firebaseUser.uid, (updated) => {
            if (updated) {
              setAuthState((prev) => ({
                ...prev,
                user: updated,
                isAuthenticated: updated.status === 'active',
                isPendingApproval: updated.status === 'pending',
              }));
            }
          });
        } else {
          // Firebase Auth user without Firestore doc (shouldn't happen normally)
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isPendingApproval: false,
          });
        }
      } catch (err) {
        console.error('[AuthContext] Error loading user profile:', err);
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isPendingApproval: false,
        });
      }
    });

    return () => {
      unsub();
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
      }
    };
  }, []);

  // ── Actions ──
  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    return loginWithEmail(email, password);
  }, []);

  const loginNickname = useCallback(async (nickname: string, password: string): Promise<AuthResult> => {
    return loginWithNickname(nickname, password);
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<AuthResult> => {
    const res = await registerWithNickname(data, authConfig.requireApproval);
    if (res.success && res.user && res.user.status === 'pending') {
      sendNotification({
        type: 'PENDING_USER',
        title: 'Tài khoản mới chờ phê duyệt',
        message: `${data.displayName || data.nickname} (${data.department ? `Khoa ${data.department}` : 'Toàn viện'}) vừa tạo tài khoản và đang chờ duyệt.`,
        targetRole: 'head',
        department: data.department || 'ALL',
        actionTab: 'config',
        actionSubTab: 'users',
        createdBy: data.displayName || data.nickname,
      }).catch((e) => console.warn('[notification] Failed to send pending user notif:', e));
    }
    return res;
  }, [authConfig.requireApproval]);

  const logout = useCallback(async (): Promise<void> => {
    await authLogout();
  }, []);

  // ── Derived values ──
  const currentRole = authState.user?.role ?? 'guest';
  const isAdmin = currentRole === 'admin';
  const isHead = currentRole === 'head';
  const isHeadOrAdmin = isAdmin || isHead;

  const value: AuthContextValue = {
    ...authState,
    authConfig,
    login,
    loginNickname,
    register,
    logout,
    currentRole,
    isAdmin,
    isHead,
    isHeadOrAdmin,
    pendingApprovalCount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
