import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6 w-full animate-fade-in">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-red-200 shadow-xl p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-sm">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1.5 font-heading">
              {this.props.fallbackTitle || 'Đã xảy ra sự cố hiển thị'}
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Thành phần này gặp lỗi trong quá trình kết xuất. Dữ liệu của bạn vẫn an toàn trên hệ thống.
            </p>

            {this.state.error && (
              <div className="mb-5 text-left bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                <p className="text-xs font-mono text-red-600 font-semibold break-all">
                  {this.state.error.message || String(this.state.error)}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] text-gray-400 mt-2 font-mono whitespace-pre-wrap overflow-x-auto">
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-xl text-xs font-bold shadow-md shadow-primary-700/20 transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Thử lại
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold border border-gray-300 transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
