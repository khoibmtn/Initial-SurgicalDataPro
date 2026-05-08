/**
 * ProfileConfig — UI for managing surgery profiles
 * CRUD profiles + add/remove surgery names from profile
 * Data stored in Firestore (global, real-time)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, X, Search, Users, Tag, ChevronRight } from 'lucide-react';
import { SurgeryProfile, SurgeryNamePrice } from '../../types';
import {
  createProfile,
  deleteProfile,
  addSurgeryToProfile,
  removeSurgeryFromProfile,
  getUniqueNameCodePairsFromPrices,
  SurgeryNameCodePair,
} from '../../services/profileService';

interface Props {
  profiles: SurgeryProfile[];
  surgeryNamePrices: SurgeryNamePrice[];
}

export const ProfileConfig: React.FC<Props> = ({ profiles, surgeryNamePrices }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const selectedProfile = profiles.find(p => p.id === selectedId);

  // All unique (maTuongDuong + tenKT) pairs from the price catalog
  const allPairs = useMemo(
    () => getUniqueNameCodePairsFromPrices(surgeryNamePrices),
    [surgeryNamePrices]
  );

  // Pairs available to add (exclude items whose tenKT already in selected profile)
  const availablePairs = useMemo(() => {
    if (!selectedProfile) return allPairs;
    const existing = new Set(selectedProfile.surgeryNames); // already lowercase
    return allPairs.filter(p => !existing.has(p.tenKT.toLowerCase()));
  }, [allPairs, selectedProfile]);

  // Remove Vietnamese diacritics for fuzzy matching
  const removeDiacritics = useCallback((str: string) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }, []);

  // Fuzzy-filtered pairs for the add modal search
  // Supports: non-diacritic Vietnamese (e.g. "cat ruot" → "Cắt ruột")
  // Multi-token: all space-separated words must match in either tenKT or maTuongDuong
  const filteredAvailable = useMemo(() => {
    if (!addSearch.trim()) return availablePairs;
    const q = addSearch.trim().toLowerCase();
    const qNorm = removeDiacritics(q);
    const tokens = qNorm.split(/\s+/);
    return availablePairs.filter(p => {
      const nameNorm = removeDiacritics(p.tenKT.toLowerCase());
      const codeNorm = removeDiacritics((p.maTuongDuong || '').toLowerCase());
      const combined = `${codeNorm} ${nameNorm}`;
      return tokens.every(t => combined.includes(t));
    });
  }, [availablePairs, addSearch, removeDiacritics]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateProfile = async () => {
    const name = newName.trim();
    if (!name) return;

    // Check uniqueness
    if (profiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Tên profile đã tồn tại', 'error');
      return;
    }

    setSaving(true);
    try {
      const id = await createProfile(name);
      setNewName('');
      setSelectedId(id);
      showToast(`Đã tạo profile "${name}"`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tạo profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!window.confirm(`Xác nhận xóa profile "${name}"?`)) return;
    try {
      await deleteProfile(id);
      if (selectedId === id) setSelectedId(null);
      showToast(`Đã xóa profile "${name}"`);
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa', 'error');
    }
  };

  const handleAddSurgery = async (pair: SurgeryNameCodePair) => {
    if (!selectedProfile) return;
    // Only store tenKT in profile, not maTuongDuong
    const tenKT = pair.tenKT;
    // Double-check: if tenKT already exists, skip
    if (selectedProfile.surgeryNames.includes(tenKT.toLowerCase())) {
      showToast('Kỹ thuật đã có trong profile', 'error');
      return;
    }
    try {
      await addSurgeryToProfile(selectedProfile.id, tenKT);
    } catch (err: any) {
      showToast(err.message || 'Lỗi thêm kỹ thuật', 'error');
    }
  };

  const handleRemoveSurgery = async (tenKT: string) => {
    if (!selectedProfile) return;
    try {
      await removeSurgeryFromProfile(selectedProfile.id, tenKT);
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa kỹ thuật', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-fade-in ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header + Create Form */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Users className="h-4 w-4 text-gray-500" />
          Profile kỹ thuật
          <span className="text-[10px] text-gray-400 font-normal ml-1">({profiles.length} profile)</span>
        </h3>
      </div>

      {/* Create new profile */}
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateProfile()}
          placeholder="Tên profile mới..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <button
          onClick={handleCreateProfile}
          disabled={saving || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Tạo mới
        </button>
      </div>

      {/* Profile list + Detail panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Profile list */}
        <div className="space-y-2">
          {profiles.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center">
              <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Chưa có profile nào</p>
            </div>
          ) : (
            profiles.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  selectedId === p.id
                    ? 'bg-primary-50 border-primary-300 shadow-sm'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                    selectedId === p.id ? 'text-primary-600 rotate-90' : 'text-gray-400'
                  }`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${
                      selectedId === p.id ? 'text-primary-800' : 'text-gray-700'
                    }`}>{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.surgeryNames.length} kỹ thuật</p>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id, p.name); }}
                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  title="Xóa profile"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Right: Detail panel */}
        <div className="md:col-span-2">
          {selectedProfile ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Profile header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{selectedProfile.name}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {selectedProfile.surgeryNames.length} kỹ thuật đã chọn
                  </p>
                </div>
                <button
                  onClick={() => { setShowAddModal(true); setAddSearch(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-bold hover:bg-primary-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm kỹ thuật
                </button>
              </div>

              {/* Surgery names list */}
              <div className="max-h-[400px] overflow-y-auto">
                {selectedProfile.surgeryNames.length === 0 ? (
                  <div className="p-8 text-center">
                    <Tag className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Chưa có kỹ thuật nào</p>
                    <p className="text-[10px] text-gray-400 mt-1">Nhấn "Thêm kỹ thuật" để bắt đầu</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {selectedProfile.surgeryNames.map((name, idx) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 group">
                        <span className="text-xs text-gray-700">
                          <span className="text-[9px] text-gray-400 mr-1.5">{idx + 1}.</span>
                          {name}
                        </span>
                        <button
                          onClick={() => handleRemoveSurgery(name)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                          title="Xóa khỏi profile"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-12 text-center">
              <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-medium">Chọn một profile để xem chi tiết</p>
              <p className="text-xs text-gray-400 mt-1">Hoặc tạo profile mới ở trên</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Surgery Modal */}
      {showAddModal && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-800">Thêm kỹ thuật vào "{selectedProfile.name}"</h4>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {filteredAvailable.length} kỹ thuật có thể thêm ({allPairs.length} tổng danh mục)
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Tìm tên kỹ thuật hoặc mã tương đương..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
                  autoFocus
                />
              </div>
            </div>

            {/* List — 2 columns: maTuongDuong | tenKT */}
            <div className="flex-1 overflow-y-auto max-h-[50vh]">
              {filteredAvailable.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  {addSearch.trim() ? 'Không tìm thấy kết quả' : 'Tất cả kỹ thuật đã được thêm'}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredAvailable.slice(0, 100).map((pair, idx) => (
                    <button
                      key={`${pair.maTuongDuong}|${pair.tenKT}|${idx}`}
                      onClick={() => handleAddSurgery(pair)}
                      className="w-full text-left px-5 py-2.5 text-xs text-gray-700 hover:bg-primary-50 hover:text-primary-800 transition-colors flex items-center gap-2 group"
                    >
                      {pair.maTuongDuong && (
                        <span className="shrink-0 font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded min-w-[80px] text-center group-hover:bg-primary-100 group-hover:text-primary-600">
                          {pair.maTuongDuong}
                        </span>
                      )}
                      <span className="flex-1 break-words">{pair.tenKT}</span>
                      <Plus className="h-3 w-3 text-gray-300 group-hover:text-primary-500 shrink-0 ml-1" />
                    </button>
                  ))}
                  {filteredAvailable.length > 100 && (
                    <div className="px-5 py-2 text-[10px] text-gray-400 text-center">
                      Hiển thị 100/{filteredAvailable.length} kết quả — thu hẹp tìm kiếm
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
