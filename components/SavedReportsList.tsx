import React, { useEffect, useState } from 'react';
import { reportService } from '../services/reportService';
import { FileText, Calendar, Clock, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

// Local type for saved report metadata used in this component
interface SavedReportMeta {
    id: string;
    type: 'DAILY' | 'MONTHLY';
    date: string;
    createdBy: string;
    createdAt: { seconds: number } | null;
    dateRangeText?: string;
    stats: {
        totalSurgeries: number;
        staffConflicts: number;
        missingMachines: number;
    };
}


interface SavedReportsListProps {
    type: 'daily' | 'monthly';
    onLoadReport: (reportId: string) => Promise<void>;
    currentReportId?: string | null;
}

export const SavedReportsList: React.FC<SavedReportsListProps> = ({ type, onLoadReport, currentReportId }) => {
    const [reports, setReports] = useState<SavedReportMeta[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const fetchReports = async () => {
        setLoading(true);
        try {
            // TODO: implement getSavedReports API in reportService
            const allReports: SavedReportMeta[] = [];
            // Filter by type
            const filtered = allReports.filter(r => r.type === type);
            setReports(filtered);
        } catch (error) {
            console.error("Failed to load reports:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [type]);

    const handleLoad = async (id: string) => {
        setLoadingId(id);
        try {
            await onLoadReport(id);
        } catch (error) {
            console.error("Error loading report:", error);
            alert("Lỗi tải báo cáo: " + (error as any).message);
        } finally {
            setLoadingId(null);
        }
    };

    if (loading && reports.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Đang tải danh sách...</span>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Báo cáo đã lưu
                </h3>
                <button
                    onClick={fetchReports}
                    className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Làm mới"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[300px] lg:max-h-[400px]">
                {reports.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                        <p className="text-xs">Chưa có báo cáo nào được lưu.</p>
                    </div>
                ) : (
                    reports.map(report => (
                        <div
                            key={report.id}
                            className={`p-3 rounded-lg border transition-all cursor-pointer group relative ${currentReportId === report.id
                                    ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                                    : 'bg-white border-gray-100 hover:border-indigo-200 hover:bg-gray-50'
                                }`}
                            onClick={() => handleLoad(report.id)}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-bold text-gray-800 text-xs line-clamp-1 flex-1">
                                    {report.dateRangeText || "Không có thời gian"}
                                </span>
                                {loadingId === report.id && <Loader2 className="h-3 w-3 animate-spin text-indigo-600 ml-2" />}
                            </div>

                            <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-2">
                                <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                    <Calendar className="h-3 w-3" />
                                    {report.createdAt?.seconds ? format(new Date(report.createdAt.seconds * 1000), 'dd/MM/yyyy') : 'N/A'}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {report.createdAt?.seconds ? format(new Date(report.createdAt.seconds * 1000), 'HH:mm') : 'N/A'}
                                </span>
                            </div>

                            <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-[10px]">
                                <div className="text-center">
                                    <span className="block font-bold text-gray-700">{report.stats.totalSurgeries}</span>
                                    <span className="text-gray-400">Ca</span>
                                </div>
                                <div className="text-center">
                                    <span className={`block font-bold ${report.stats.staffConflicts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        {report.stats.staffConflicts}
                                    </span>
                                    <span className="text-gray-400">Trùng NV</span>
                                </div>
                                <div className="text-center">
                                    <span className={`block font-bold ${report.stats.missingMachines > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                        {report.stats.missingMachines}
                                    </span>
                                    <span className="text-gray-400">Thiếu Máy</span>
                                </div>
                            </div>

                            {/* Hover Arrow */}
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400">
                                <ArrowRight className="h-4 w-4" />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
