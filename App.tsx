import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { processSurgicalFiles } from "./services/excelProcessor";
import { StatsCard } from './components/StatsCard';
import { DevToolsConfig } from './components/DevToolsConfig';
import { ConfigurationTab } from './components/ConfigurationTab';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { analyzeReport } from './services/geminiService';
import { ProcessingResult, AppStatus, FileState } from './types';
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Download,
  FileText,
  Users,
  Zap,
  Loader2,
  BrainCircuit,
  CheckCircle,
  CreditCard,
  Terminal,
  Settings,
  LayoutDashboard,
  FileBarChart
} from 'lucide-react';

const InnerApp: React.FC = () => {
  const { config } = useConfig();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'config'>('dashboard');

  const [files, setFiles] = useState<FileState>({ listFile: null, detailFile: null });
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [result, setResult] = useState<any>(null);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<string>('');

  const handleProcess = async () => {
    console.log(">>> ĐÃ BẤM PROCESS FILES <<<");

    if (!files.listFile || !files.detailFile) {
      alert("Vui lòng tải đủ 2 file Excel");
      return;
    }

    try {
      setStatus(AppStatus.PROCESSING);

      const result: ProcessingResult = await processSurgicalFiles(
        files.listFile,
        files.detailFile,
        config
      );

      console.log("Kết quả xử lý:", result);

      setResult(result);
      setStatus(AppStatus.COMPLETE);
    } catch (error: any) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      setResult(null);

      const msg =
        error && typeof error.message === "string"
          ? error.message
          : "Có lỗi xảy ra khi xử lý file. Vui lòng kiểm tra lại 2 file đầu vào.";
      setErrorMsg(msg);
      alert(msg);
    }
  };

  const handleAIAnalysis = async () => {
    if (!result) return;
    setStatus(AppStatus.ANALYZING);
    try {
      const summary = await analyzeReport(result.stats, result.conflicts);
      setAiSummary(summary);
      setStatus(AppStatus.COMPLETE);
    } catch (e) {
      setAiSummary("Could not retrieve AI analysis.");
      setStatus(AppStatus.COMPLETE); // Return to complete state even if AI fails
    }
  };




  const handleDownload = () => {
    if (!result?.downloadUrl) {
      alert("Chưa có file kết quả.");
      return;
    }

    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = `Ket_qua_kiem_tra_PTTT_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };




  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20">
      <DevToolsConfig isOpen={isDevToolsOpen} onClose={() => setIsDevToolsOpen(false)} />

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Danh sách phẫu thuật<span className="text-indigo-600">Pro</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Tab Navigation (Desktop) */}
            <nav className="hidden md:flex gap-1 p-1 bg-gray-100/50 rounded-xl mr-4">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200/50'}`}
              >
                <LayoutDashboard className="h-4 w-4" /> Tổng quan
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'config' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200/50'}`}
              >
                <Settings className="h-4 w-4" /> Cấu hình
              </button>
              {/* Placeholder Reports Tab */}
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'reports' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200/50'}`}
              >
                <FileBarChart className="h-4 w-4" /> Báo cáo
              </button>
            </nav>

            <div className="h-6 w-px bg-gray-200 hidden md:block"></div>

            <button
              onClick={() => setIsDevToolsOpen(true)}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Developer Tools"
            >
              <Terminal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">

        {activeTab === 'dashboard' && (
          <>
            {/* Intro Section */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Xử lý danh sách phẫu thuật</h2>
            </div>
            <div className="bg-white p-4 rounded-lg border mb-6">
              <p className="text-lg font-semibold italic mb-3">
                Chuẩn bị 2 file sau để tải lên:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-bold">1. Danh sách phẫu thuật:</p>
                  <ul className="list-disc ml-5 text-gray-600">
                    <li>Báo cáo → Báo cáo cận lâm sàng → 10. Danh sách PT</li>
                  </ul>
                </div>
                <div>
                  <p className="font-bold">2. Chi tiết phẫu thuật theo khoa:</p>
                  <ul className="list-disc ml-5 text-gray-600">
                    <li>Nhóm theo: <b>Họ tên → Ngày làm → Máy làm</b></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Input Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <FileUpload
                label="1. Danh sách phẫu thuật thủ thuật"
                file={files.listFile}
                onFileSelect={(f) => setFiles(prev => ({ ...prev, listFile: f }))}
              />
              <FileUpload
                label="2. Danh sách chi tiết phẫu thuật theo khoa"
                file={files.detailFile}
                onFileSelect={(f) => setFiles(prev => ({ ...prev, detailFile: f }))}
              />
            </div>

            {/* Action Bar */}
            <div className="flex justify-center mb-10">
              <button
                onClick={handleProcess}
                disabled={!files.listFile || !files.detailFile || status === AppStatus.PROCESSING}
                className={`
                  flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-white shadow-lg transition-all
                  ${!files.listFile || !files.detailFile
                    ? 'bg-gray-400 cursor-not-allowed'
                    : status === AppStatus.PROCESSING
                      ? 'bg-indigo-400 cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl active:transform active:scale-95'}
                `}
              >
                {status === AppStatus.PROCESSING ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" /> Xử lý file...
                  </>
                )}
              </button>
            </div>

            {/* Error Message */}
            {status === AppStatus.ERROR && (
              <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Lỗi khi xử lý dữ liệu</h3>
                  <p className="text-sm text-red-600 mt-1">{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Results Dashboard */}
            {(status === AppStatus.COMPLETE || status === AppStatus.ANALYZING) && result && (
              <div className="space-y-8 animate-fade-in">

                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Kết quả xử lý</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={handleAIAnalysis}
                      disabled={status === AppStatus.ANALYZING}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
                    >
                      {status === AppStatus.ANALYZING
                        ? <Loader2 className="animate-spin h-4 w-4" />
                        : <BrainCircuit className="h-4 w-4" />
                      }
                      Phân tích bằng AI Gemini
                    </button>

                    {result?.downloadUrl && (
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        Tải báo cáo (file excel)
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatsCard
                    title="Tổng số ca PTTT"
                    value={result.stats.totalSurgeries}
                    icon={<Database className="h-6 w-6" />}
                  />
                  <StatsCard
                    title="Tổng số thời gian PTTT"
                    value={result.stats.totalDurationMinutes}
                    icon={<Clock className="h-6 w-6" />}
                  />
                  <StatsCard
                    title="Trùng giờ nhân viên"
                    value={result.stats.staffConflicts}
                    icon={<Users className="h-6 w-6" />}
                    alert={result.stats.staffConflicts > 0}
                  />
                  <StatsCard
                    title="Trùng mã máy"
                    value={result.stats.machineConflicts}
                    icon={<Zap className="h-6 w-6" />}
                    alert={result.stats.machineConflicts > 0}
                  />
                  <StatsCard
                    title="Thiếu mã máy"
                    value={result.stats.missingMachines}
                    icon={<AlertTriangle className="h-6 w-6" />}
                    alert={result.stats.missingMachines > 0}
                  />
                  <StatsCard
                    title="Dự kiến thù lao"
                    value={new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.paymentStats?.totalAmount || 0)}
                    icon={<CreditCard className="h-6 w-6" />}
                    alert={false}
                  />
                </div>

                {/* AI Insight Section */}
                {aiSummary && (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                    <div className="flex items-center gap-2 mb-3">
                      <BrainCircuit className="text-indigo-600 h-5 w-5" />
                      <h4 className="font-bold text-indigo-900">AI Operational Analysis</h4>
                    </div>
                    <div className="prose prose-sm text-indigo-800 max-w-none">
                      <p className="whitespace-pre-line">{aiSummary}</p>
                    </div>
                  </div>
                )}

                {/* Preview Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-500" /> Danh sách trùng giờ
                    </h4>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">5 trường hợp trùng giờ đầu tiên</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                        <tr>
                          <th className="px-6 py-3">Loại</th>
                          <th className="px-6 py-3">Nhân viên/máy</th>
                          <th className="px-6 py-3">PTTT thứ 1</th>
                          <th className="px-6 py-3">PTTT thứ 2 (trùng)</th>
                          <th className="px-6 py-3">Thời gian trùng (phút)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.conflicts.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                              <CheckCircle className="h-8 w-8 mx-auto text-green-500 mb-2" />
                              Không phát hiện trùng giờ!
                            </td>
                          </tr>
                        ) : (
                          result.conflicts.slice(0, 5).map((c: any, i: number) => (
                            <tr key={i} className="bg-white border-b hover:bg-gray-50">
                              <td className="px-6 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${c.type === 'STAFF' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {c.type === 'STAFF' ? 'Nhân viên' : 'Máy'}
                                </span>
                              </td>
                              <td className="px-6 py-3 font-medium text-gray-900">{c.resourceName}</td>
                              <td className="px-6 py-3 text-gray-600">{c.surgeryA}</td>
                              <td className="px-6 py-3 text-gray-600">{c.surgeryB}</td>
                              <td className="px-6 py-3 text-red-600 font-semibold">{c.durationOverlap} min</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Configuration Tab */}
        {activeTab === 'config' && (
          <ConfigurationTab />
        )}

        {/* Reports Tab (Placeholder) */}
        {activeTab === 'reports' && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
            <div className="bg-gray-100 p-4 rounded-full mb-4">
              <FileBarChart className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Tính năng đang phát triển</h3>
            <p className="max-w-md">Trang báo cáo chi tiết sẽ cho phép xem trước và lọc dữ liệu trước khi xuất file Excel. Hãy quay lại sau!</p>
          </div>
        )}

      </main>
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ConfigProvider>
      <InnerApp />
    </ConfigProvider>
  )
};

export default App;