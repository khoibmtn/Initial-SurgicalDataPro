import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Lock, Unlock, X, ClipboardList, Database, Users, Shield, Building2, BookOpen, DollarSign, Cpu, Activity, Layers } from 'lucide-react';
import { Receipt } from 'lucide-react';
import { useConfig } from '../contexts/ConfigContext';
import { LaborConfigVersion, SurgeryNamePrice, ChapterCatalog, SurgeryProfile, SurgeryCostItem } from '../types';
import { LaborConfigManager } from './config/LaborConfigManager';
import { subscribeToLaborConfigs, ensureDefaultLaborConfig } from '../services/laborConfigService';
import { subscribeToSurgeryNamePrices } from '../services/surgeryNamePriceService';
import { ContextToolbar, TabLine } from './ui';
import { subscribeToPriceVersions } from '../services/pricingService';
import { subscribeToChapterCatalog } from '../services/chapterCatalogService';
import { subscribeToProfiles } from '../services/profileService';
import { subscribeToCostItems } from '../services/surgeryCostService';
import { SurgeryNamePriceConfig } from './statistics/SurgeryNamePriceConfig';
import { ChapterCatalogConfig } from './statistics/ChapterCatalogConfig';
import { SurgeryCostConfig } from './statistics/SurgeryCostConfig';
import { RequiredMachineCatalogConfig } from './config/RequiredMachineCatalogConfig';
import { MachineRegistryConfig } from './config/MachineRegistryConfig';
import { AdminSettingsConfig } from './config/AdminSettingsConfig';
import { DepartmentConfig } from './config/DepartmentConfig';
import { StaffListConfig } from './config/StaffListConfig';
import { UserManagementPanel } from './auth/UserManagementPanel';
import { useAuth } from '../contexts/AuthContext';

interface ConfigurationTabProps {
    onConfigUpdate?: () => void;
    initialSubTab?: 'norms' | 'dmkt' | 'staff' | 'users';
}

export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ onConfigUpdate, initialSubTab }) => {
    const { config, updateConfig, resetConfig, isLoaded, isLocked, unlockConfig, lockConfig } = useConfig();
    const { isAdmin, isHead, pendingApprovalCount } = useAuth();
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'dmkt' | 'staff' | 'users'>(
        initialSubTab || (isHead && !isAdmin ? 'users' : 'norms')
    );

    useEffect(() => {
        if (initialSubTab) {
            setActiveSubTab(initialSubTab);
        }
    }, [initialSubTab]);
    const [dmktSubTab, setDmktSubTab] = useState<'chapter-catalog' | 'price-catalog' | 'cost-catalog' | 'machines' | 'registry'>('chapter-catalog');
    const [staffSubTab, setStaffSubTab] = useState<'admin' | 'departments' | 'staff-list'>('admin');
    const [accountSubTab, setAccountSubTab] = useState<'accounts' | 'permissions'>('accounts');

    // Lock modal state
    const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
    const [unlockModalPwd, setUnlockModalPwd] = useState('');
    const [unlockModalError, setUnlockModalError] = useState('');

    const handleUnlockModalSubmit = () => {
        setUnlockModalError('');
        if (!unlockModalPwd) {
            setUnlockModalError('Vui lòng nhập mật khẩu!');
            return;
        }
        const res = unlockConfig(unlockModalPwd);
        if (res.success) {
            setIsUnlockModalOpen(false);
            setUnlockModalPwd('');
        } else {
            setUnlockModalError(res.error || 'Mật khẩu không chính xác!');
        }
    };

    // --- Timeline-based labor config ---
    const [laborConfigs, setLaborConfigs] = useState<LaborConfigVersion[]>([]);
    useEffect(() => {
        ensureDefaultLaborConfig(config.priceConfig, config.timeRules).catch(console.error);
        const unsub = subscribeToLaborConfigs(setLaborConfigs);
        return () => unsub();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Subscriptions for migrated tabs ---
    const [surgeryNamePrices, setSurgeryNamePrices] = useState<SurgeryNamePrice[]>([]);
    const [chapters, setChapters] = useState<ChapterCatalog[]>([]);
    const [profiles, setProfiles] = useState<SurgeryProfile[]>([]);
    const [costItems, setCostItems] = useState<SurgeryCostItem[]>([]);

    useEffect(() => {
        const unsub = subscribeToSurgeryNamePrices(setSurgeryNamePrices);
        return () => unsub();
    }, []);
    useEffect(() => { const unsub = subscribeToPriceVersions(() => {}); return unsub; }, []);
    useEffect(() => { const unsub = subscribeToChapterCatalog(setChapters); return unsub; }, []);
    useEffect(() => { const unsub = subscribeToProfiles(setProfiles); return unsub; }, []);
    useEffect(() => { const unsub = subscribeToCostItems(setCostItems); return unsub; }, []);

    if (!isLoaded) return <div>Loading config...</div>;

    return (
        <div className="flex flex-col flex-1 min-h-0 font-inter text-sm">

            {/* Firebase-style Page Header: title + sub-tabs */}
            <ContextToolbar
              title="Cấu hình"
              beforeTitle={
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) {
                      setUnlockModalPwd('');
                      setUnlockModalError('');
                      setIsUnlockModalOpen(true);
                    } else {
                      lockConfig();
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    isLocked
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-xs'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                  }`}
                  title={isLocked ? 'Cấu hình đang khóa (Chỉ xem) - Bấm để mở khóa' : 'Cấu hình đã mở khóa - Bấm để khóa lại'}
                >
                  {isLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Đang khóa</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Đã mở</span>
                    </>
                  )}
                </button>
              }
            >
              <TabLine
                value={activeSubTab}
                onChange={(v) => setActiveSubTab(v as any)}
                options={[
                  { value: 'norms', label: 'Định mức & Phụ cấp', icon: ClipboardList },
                  { value: 'dmkt', label: 'DMKT', icon: Database },
                  { value: 'staff', label: 'Hành chính', icon: Users },
                  ...(isAdmin
                    ? [{
                        value: 'users',
                        label: pendingApprovalCount > 0 ? `Tài khoản (${pendingApprovalCount})` : 'Tài khoản',
                        icon: Shield,
                      }]
                    : isHead
                    ? [{
                        value: 'users',
                        label: pendingApprovalCount > 0 ? `Tài khoản (${pendingApprovalCount})` : 'Tài khoản',
                        icon: Building2,
                      }]
                    : []),
                ]}
              />
            </ContextToolbar>

            {/* Modal Nhập mật khẩu mở khóa Cấu hình */}
            {isUnlockModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden animate-scale-up">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/60">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                        <Lock className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-sm text-gray-900">Mở khóa cấu hình</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsUnlockModalOpen(false)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Nhập mật khẩu để mở quyền thêm, sửa, xóa và thay đổi thiết lập trong phiên làm việc này:
                    </p>
                    <input
                      type="password"
                      placeholder="Nhập mật khẩu"
                      value={unlockModalPwd}
                      onChange={(e) => setUnlockModalPwd(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUnlockModalSubmit()}
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                    {unlockModalError && (
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {unlockModalError}
                      </p>
                    )}
                  </div>
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsUnlockModalOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlockModalSubmit}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                    >
                      Xác nhận mở khóa
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stationary Subtabs Bar for DMKT */}
            {activeSubTab === 'dmkt' && (
              <div className="bg-white pt-4 shrink-0 z-10">
                <div className="border-y border-blue-200/80 bg-blue-50/75 px-6">
                  <TabLine
                    value={dmktSubTab}
                    onChange={(v) => setDmktSubTab(v as any)}
                    size="sm"
                    options={[
                      { value: 'chapter-catalog', label: 'DM Chương', icon: BookOpen },
                      { value: 'price-catalog', label: 'DM Giá DVKT', icon: DollarSign },
                      { value: 'cost-catalog', label: 'DM Chi phí', icon: Receipt },
                      { value: 'machines', label: 'DM sử dụng mã máy', icon: Cpu },
                      { value: 'registry', label: 'DM Mã máy', icon: Activity },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Stationary Subtabs Bar for Hành chính */}
            {activeSubTab === 'staff' && (
              <div className="bg-white pt-4 shrink-0 z-10">
                <div className="border-y border-blue-200/80 bg-blue-50/75 px-6">
                  <TabLine
                    value={staffSubTab}
                    onChange={(v) => setStaffSubTab(v as any)}
                    size="sm"
                    options={[
                      { value: 'admin', label: 'Hành chính', icon: Building2 },
                      { value: 'departments', label: 'DM Khoa, phòng', icon: Layers },
                      { value: 'staff-list', label: 'Nhân viên y tế', icon: Users },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Stationary Subtabs Bar for Tài khoản */}
            {activeSubTab === 'users' && (
              <div className="bg-white pt-4 shrink-0 z-10">
                <div className="border-y border-blue-200/80 bg-blue-50/75 px-6">
                  <TabLine
                    value={accountSubTab}
                    onChange={(v) => setAccountSubTab(v as any)}
                    size="sm"
                    options={[
                      {
                        value: 'accounts',
                        label: pendingApprovalCount > 0 ? `Quản lý tài khoản (${pendingApprovalCount})` : 'Quản lý tài khoản',
                        icon: Users,
                      },
                      {
                        value: 'permissions',
                        label: 'Cấu hình phân quyền',
                        icon: Shield,
                      },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Content area - only content scrolls */}
            <div className="p-4 flex-1 overflow-y-auto bg-white">

                {activeSubTab === 'users' && (isAdmin || isHead) && (
                    <div className="animate-fade-in">
                        <UserManagementPanel activeSubTab={accountSubTab} onSubTabChange={setAccountSubTab} />
                    </div>
                )}

                {activeSubTab === 'norms' && (
                    <div className="animate-fade-in space-y-6">
                        <LaborConfigManager laborConfigs={laborConfigs} />
                    </div>
                )}

                {activeSubTab === 'dmkt' && (
                    <div className="animate-fade-in space-y-4">
                        {dmktSubTab === 'chapter-catalog' && (
                            <div className="p-1"><ChapterCatalogConfig chapters={chapters} /></div>
                        )}
                        {dmktSubTab === 'price-catalog' && (
                            <div className="p-1"><SurgeryNamePriceConfig surgeryNamePrices={surgeryNamePrices} costItems={costItems} profiles={profiles} /></div>
                        )}
                        {dmktSubTab === 'cost-catalog' && (
                            <div className="p-1"><SurgeryCostConfig costItems={costItems} /></div>
                        )}
                        {dmktSubTab === 'machines' && (
                            <RequiredMachineCatalogConfig />
                        )}
                        {dmktSubTab === 'registry' && (
                            <MachineRegistryConfig onConfigUpdate={onConfigUpdate} />
                        )}
                    </div>
                )}

                {activeSubTab === 'staff' && (
                    <div className="animate-fade-in space-y-4">
                        {staffSubTab === 'admin' && <AdminSettingsConfig />}
                        {staffSubTab === 'departments' && <DepartmentConfig />}
                        {staffSubTab === 'staff-list' && <StaffListConfig onConfigUpdate={onConfigUpdate} />}
                    </div>
                )}

            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <button
                    type="button"
                    onClick={() => {
                        if (isLocked) return;
                        resetConfig();
                    }}
                    disabled={isLocked}
                    title={isLocked ? "Cấu hình đang bị khóa (Chỉ xem)" : "Khôi phục cấu hình về cài đặt gốc"}
                    className={`text-sm flex items-center gap-1 font-medium transition-colors ${
                        isLocked
                            ? 'text-gray-400 opacity-40 cursor-not-allowed pointer-events-none select-none no-underline'
                            : 'text-red-600 hover:text-red-700 hover:underline cursor-pointer'
                    }`}
                >
                    <RefreshCw className="h-4 w-4" /> Khôi phục mặc định
                </button>
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                    <Save className="h-3 w-3 text-green-500" />
                    Tự động lưu thay đổi
                </div>
            </div>
        </div >
    );
};
