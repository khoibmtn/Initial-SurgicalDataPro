import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, ClipboardList, Database, Users, Shield, Building2, BookOpen, DollarSign, Cpu, Activity, Layers, Receipt, Package } from 'lucide-react';
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
import { AuthGuardView } from './auth/AuthGuardView';
import { PositionCatalogConfig } from './config/PositionCatalogConfig';
import { ServicePackageConfig } from './config/ServicePackageConfig';
import { ServicePackageSettingsConfig } from './config/ServicePackageSettingsConfig';
import type { AppUser } from '../types/auth';

interface ConfigurationTabProps {
    onConfigUpdate?: () => void;
    initialSubTab?: 'norms' | 'dmkt' | 'staff' | 'users' | 'packages';
    onOpenAuditLogWithUser?: (user: AppUser) => void;
}

export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({
    onConfigUpdate,
    initialSubTab,
    onOpenAuditLogWithUser,
}) => {
    const { config, updateConfig, resetConfig, isLoaded } = useConfig();
    const { isAdmin, isHead, isDeputyHead, pendingApprovalCount, can, isAuthenticated } = useAuth();
    const [activeSubTab, setActiveSubTab] = useState<'norms' | 'dmkt' | 'staff' | 'users' | 'packages'>(
        initialSubTab || ((isHead || isDeputyHead) && !isAdmin ? 'users' : 'norms')
    );

    useEffect(() => {
        if (initialSubTab) {
            setActiveSubTab(initialSubTab);
        }
    }, [initialSubTab]);
    const [dmktSubTab, setDmktSubTab] = useState<'chapter-catalog' | 'price-catalog' | 'cost-catalog' | 'machines' | 'registry'>('chapter-catalog');
    const [staffSubTab, setStaffSubTab] = useState<'admin' | 'departments' | 'staff-list'>('admin');
    const [accountSubTab, setAccountSubTab] = useState<'accounts' | 'permissions'>('accounts');
    const [pkgSubTab, setPkgSubTab] = useState<'positions' | 'packages' | 'settings'>('positions');

    const canManageAdmin = can('manage_admin_settings');

    useEffect(() => {
        if (!canManageAdmin && staffSubTab === 'admin') {
            setStaffSubTab('departments');
        }
    }, [canManageAdmin, staffSubTab]);

    // --- Timeline-based labor config ---
    const [laborConfigs, setLaborConfigs] = useState<LaborConfigVersion[]>([]);
    useEffect(() => {
        if (!isAuthenticated) return;
        ensureDefaultLaborConfig(config.priceConfig, config.timeRules).catch(console.error);
        const unsub = subscribeToLaborConfigs(setLaborConfigs);
        return () => unsub();
    }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Subscriptions for migrated tabs ---
    const [surgeryNamePrices, setSurgeryNamePrices] = useState<SurgeryNamePrice[]>([]);
    const [chapters, setChapters] = useState<ChapterCatalog[]>([]);
    const [profiles, setProfiles] = useState<SurgeryProfile[]>([]);
    const [costItems, setCostItems] = useState<SurgeryCostItem[]>([]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const unsub = subscribeToSurgeryNamePrices(setSurgeryNamePrices);
        return () => unsub();
    }, [isAuthenticated]);
    useEffect(() => { if (!isAuthenticated) return; const unsub = subscribeToPriceVersions(() => {}); return unsub; }, [isAuthenticated]);
    useEffect(() => { if (!isAuthenticated) return; const unsub = subscribeToChapterCatalog(setChapters); return unsub; }, [isAuthenticated]);
    useEffect(() => { if (!isAuthenticated) return; const unsub = subscribeToProfiles(setProfiles); return unsub; }, [isAuthenticated]);
    useEffect(() => { if (!isAuthenticated) return; const unsub = subscribeToCostItems(setCostItems); return unsub; }, [isAuthenticated]);

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col flex-1 min-h-0 font-inter text-sm">
                <ContextToolbar title="Cấu hình hệ thống" />
                <AuthGuardView
                    featureName="Phân hệ Cấu hình hệ thống"
                    description="Cấu hình định mức, danh mục kỹ thuật, danh sách nhân sự và phân quyền thuộc dữ liệu lưu trữ. Vui lòng đăng nhập với tài khoản có thẩm quyền để xem và chỉnh sửa."
                />
            </div>
        );
    }

    if (!isLoaded) return <div>Loading config...</div>;

    return (
        <div className="flex flex-col flex-1 min-h-0 font-inter text-sm">

            {/* Firebase-style Page Header: title + sub-tabs */}
            <ContextToolbar
              title="Cấu hình"
            >
              <TabLine
                value={activeSubTab}
                onChange={(v) => setActiveSubTab(v as any)}
                options={[
                  { value: 'norms', label: 'Định mức & Phụ cấp', icon: ClipboardList },
                  { value: 'dmkt', label: 'DMKT', icon: Database },
                  { value: 'staff', label: 'Hành chính', icon: Users },
                  ...(isAdmin || can('manage_user_roles')
                    ? [{
                        value: 'users',
                        label: pendingApprovalCount > 0 ? `Tài khoản (${pendingApprovalCount})` : 'Tài khoản',
                        icon: Shield,
                      }]
                    : (isHead || isDeputyHead || can('manage_staff'))
                    ? [{
                        value: 'users',
                        label: pendingApprovalCount > 0 ? `Tài khoản (${pendingApprovalCount})` : 'Tài khoản',
                        icon: Building2,
                      }]
                    : []),
                  { value: 'packages', label: 'Gói dịch vụ', icon: Package },
                ]}
              />
            </ContextToolbar>


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
                      ...(canManageAdmin ? [{ value: 'admin', label: 'Hành chính', icon: Building2 }] : []),
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

            {/* Stationary Subtabs Bar for Gói dịch vụ */}
            {activeSubTab === 'packages' && (
              <div className="bg-white pt-4 shrink-0 z-10">
                <div className="border-y border-blue-200/80 bg-blue-50/75 px-6">
                  <TabLine
                    value={pkgSubTab}
                    onChange={(v) => setPkgSubTab(v as any)}
                    size="sm"
                    options={[
                      { value: 'positions', label: 'DM Vị trí', icon: Users },
                      { value: 'packages', label: 'Cấu hình gói', icon: Package },
                      { value: 'settings', label: 'Thiết lập', icon: ClipboardList },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* Content area - only content scrolls */}
            <div className="p-4 flex-1 overflow-y-auto bg-white">

                {activeSubTab === 'users' && (isAdmin || isHead || isDeputyHead || can('manage_user_roles') || can('manage_staff')) && (
                    <div className="animate-fade-in">
                        <UserManagementPanel
                            activeSubTab={accountSubTab}
                            onSubTabChange={setAccountSubTab}
                            onViewUserLogs={onOpenAuditLogWithUser}
                        />
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
                        {staffSubTab === 'admin' && canManageAdmin && <AdminSettingsConfig />}
                        {staffSubTab === 'departments' && <DepartmentConfig />}
                        {staffSubTab === 'staff-list' && <StaffListConfig onConfigUpdate={onConfigUpdate} />}
                    </div>
                )}

                {activeSubTab === 'packages' && (
                    <div className="animate-fade-in space-y-4">
                        {pkgSubTab === 'positions' && <PositionCatalogConfig />}
                        {pkgSubTab === 'packages' && <ServicePackageConfig />}
                        {pkgSubTab === 'settings' && <ServicePackageSettingsConfig />}
                    </div>
                )}

            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <button
                    type="button"
                    onClick={() => {
                        if (!isAdmin && !can('system_config')) return;
                        resetConfig();
                    }}
                    disabled={!isAdmin && !can('system_config')}
                    title={(!isAdmin && !can('system_config')) ? "Chỉ Quản trị viên (Admin) hoặc người có quyền Cấu hình hệ thống mới có quyền khôi phục cài đặt gốc" : "Khôi phục cấu hình về cài đặt gốc"}
                    className={`text-sm flex items-center gap-1 font-medium transition-colors ${
                        (!isAdmin && !can('system_config'))
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
