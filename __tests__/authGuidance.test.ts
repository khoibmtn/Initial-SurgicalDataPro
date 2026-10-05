import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  isAuthOrPermissionError,
  openAuthModal,
  notifyAuthRequired,
  handleActionError,
} from '../utils/authGuidance';

describe('authGuidance utility', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') {
      (globalThis as any).window = {
        dispatchEvent: vi.fn(),
      };
      (globalThis as any).CustomEvent = class CustomEvent {
        constructor(public type: string, public options?: any) {
          this.detail = options?.detail;
        }
        detail: any;
      };
    }
  });
  describe('isAuthOrPermissionError', () => {
    it('returns false for falsy values', () => {
      expect(isAuthOrPermissionError(null)).toBe(false);
      expect(isAuthOrPermissionError(undefined)).toBe(false);
    });

    it('detects Firestore permission-denied code', () => {
      const error = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
      expect(isAuthOrPermissionError(error)).toBe(true);
    });

    it('detects RTDB PERMISSION_DENIED code', () => {
      const error = { code: 'PERMISSION_DENIED', message: 'Client doesn\'t have permission to access the desired data.' };
      expect(isAuthOrPermissionError(error)).toBe(true);
    });

    it('detects auth error codes', () => {
      expect(isAuthOrPermissionError({ code: 'auth/unauthenticated' })).toBe(true);
      expect(isAuthOrPermissionError({ code: 'auth/unauthorized' })).toBe(true);
    });

    it('detects permission keywords in message', () => {
      expect(isAuthOrPermissionError(new Error('Missing or insufficient permissions.'))).toBe(true);
      expect(isAuthOrPermissionError(new Error('Permission denied at /schedules'))).toBe(true);
      expect(isAuthOrPermissionError(new Error('Người dùng không có quyền thao tác'))).toBe(true);
      expect(isAuthOrPermissionError(new Error('Tính năng yêu cầu đăng nhập'))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isAuthOrPermissionError(new Error('Network timeout'))).toBe(false);
      expect(isAuthOrPermissionError(new Error('Cannot read properties of undefined'))).toBe(false);
      expect(isAuthOrPermissionError({ code: 'unavailable', message: 'The service is currently unavailable.' })).toBe(false);
    });
  });

  describe('openAuthModal', () => {
    it('dispatches app:open-auth-modal event with specified view mode', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      openAuthModal('register');

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('app:open-auth-modal');
      expect(event.detail).toEqual({ view: 'register' });

      dispatchSpy.mockRestore();
    });

    it('defaults to login view mode', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      openAuthModal();

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ view: 'login' });

      dispatchSpy.mockRestore();
    });
  });

  describe('notifyAuthRequired', () => {
    it('calls addToast with warning type and custom title for unauthenticated user', () => {
      const addToast = vi.fn();
      notifyAuthRequired(addToast, 'truy vấn dữ liệu lưu trữ');

      expect(addToast).toHaveBeenCalledTimes(1);
      const [content, type, duration, title] = addToast.mock.calls[0];
      expect(React.isValidElement(content)).toBe(true);
      expect(type).toBe('warning');
      expect(duration).toBe(12000);
      expect(title).toBe('Yêu cầu đăng nhập');
    });

    it('calls addToast with custom title for pending approval user', () => {
      const addToast = vi.fn();
      notifyAuthRequired(addToast, 'truy vấn dữ liệu lưu trữ', true);

      expect(addToast).toHaveBeenCalledTimes(1);
      const [, , , title] = addToast.mock.calls[0];
      expect(title).toBe('Tài khoản chờ duyệt');
    });
  });

  describe('handleActionError', () => {
    it('delegates to notifyAuthRequired when error is permission-denied', () => {
      const addToast = vi.fn();
      const error = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };

      handleActionError(error, 'Có lỗi xảy ra khi lấy dữ liệu.', addToast, 'truy vấn dữ liệu lưu trữ');

      expect(addToast).toHaveBeenCalledTimes(1);
      const [, type, , title] = addToast.mock.calls[0];
      expect(type).toBe('warning');
      expect(title).toBe('Yêu cầu đăng nhập');
    });

    it('displays fallback error message when error is not an auth error', () => {
      const addToast = vi.fn();
      const error = new Error('Database disconnected');

      handleActionError(error, 'Có lỗi xảy ra khi lấy dữ liệu.', addToast, 'truy vấn dữ liệu lưu trữ');

      expect(addToast).toHaveBeenCalledTimes(1);
      const [msg, type] = addToast.mock.calls[0];
      expect(type).toBe('error');
      expect(msg).toContain('Có lỗi xảy ra khi lấy dữ liệu.');
      expect(msg).toContain('Database disconnected');
    });
  });
});
